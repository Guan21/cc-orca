import { Client } from 'ssh2'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { connect as connectSocket } from 'node:net'
import type { ClientChannel } from 'ssh2'
import { runProcess } from '../../../src/shared/child-process/run-process'
import type { EphemeralVmRecipeConnection } from '../../../src/shared/ephemeral-vm-recipes'

export function quoteGuest(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export class CorporateVmGuest {
  readonly client = new Client()
  readonly sessionId = randomUUID().replaceAll('-', '').slice(0, 12)
  readonly directory = `/tmp/orca-egress-${this.sessionId}`
  private connected = false

  async connect(target: Extract<EphemeralVmRecipeConnection, { type: 'ssh' }>['target']) {
    if (target.proxyCommand || target.jumpHost || !target.identityFile) {
      throw new Error('VM observer requires a direct SSH recipe with a test identity file')
    }
    const identityFile = target.identityFile
    await new Promise<void>((resolve, reject) => {
      this.client.once('ready', () => {
        this.connected = true
        resolve()
      })
      this.client.once('close', () => {
        this.connected = false
      })
      this.client.on('error', () => reject(new Error('VM observer SSH connection failed')))
      this.client.connect({
        host: target.host,
        port: target.port,
        username: target.username,
        privateKey: readFileSync(identityFile),
        readyTimeout: 30_000
      })
    })
  }

  execute = async (script: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.client.exec(`bash --noprofile --norc -c ${quoteGuest(script)}`, (error, stream) => {
        if (error) {
          return reject(new Error('VM diagnostic execution failed'))
        }
        let output = ''
        const timeout = setTimeout(() => {
          stream.close()
          reject(new Error('VM diagnostic execution timed out'))
        }, 30_000)
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString('utf8')
          if (output.length > 256 * 1024) {
            stream.close()
          }
        })
        stream.stderr.resume()
        stream.on('close', (code: number) => {
          clearTimeout(timeout)
          if (code !== 0 || output.length > 256 * 1024) {
            reject(new Error('VM diagnostic execution failed (output withheld)'))
          } else {
            resolve(output.trim())
          }
        })
      })
    })
  }

  async attestRealVm(): Promise<string> {
    const provider = await this.execute(
      'test "$(uname -s)" = Linux && ! systemd-detect-virt --container --quiet && command -v python3 >/dev/null && command -v git >/dev/null && systemd-detect-virt --vm'
    )
    if (
      !/^(kvm|qemu|oracle|vmware|microsoft|xen|bhyve|amazon|apple|parallels|bochs|uml|zvm|powervm|acrn)$/u.test(
        provider
      )
    ) {
      throw new Error(
        'Real Linux VM attestation failed; containers and mock runtimes are ineligible'
      )
    }
    return provider
  }

  async controlEndpoint() {
    const value = await this.execute('printf "%s" "$SSH_CONNECTION"')
    const [address, port] = value.split(/\s+/u)
    if (!address || !port || !Number.isInteger(Number(port))) {
      throw new Error('Cannot derive VM SSH control endpoint')
    }
    return { address, port: Number(port), protocol: 'tcp' as const }
  }

  async installStubs(sentinelPort: number) {
    await this.execute(`set -eu
mkdir -m 700 ${quoteGuest(this.directory)}
cat > ${quoteGuest(`${this.directory}/provider.py`)} <<'PY'
import os, pathlib, sys, urllib.request
provider = pathlib.Path(sys.argv[0]).name
root = pathlib.Path(__file__).parent
(root / (provider + '.launch')).write_text(str(os.getpid()))
urllib.request.urlopen('http://127.0.0.1:${sentinelPort}/' + provider, timeout=10).read()
(root / (provider + '.done')).write_text('ok')
PY
for provider in claude codex; do
  cp ${quoteGuest(`${this.directory}/provider.py`)} ${quoteGuest(this.directory)}/"$provider"
done
git init -q ${quoteGuest(`${this.directory}/scm`)}
git -C ${quoteGuest(`${this.directory}/scm`)} remote add origin http://127.0.0.1:${sentinelPort}/scm
`)
  }

  async credentialOnly(provider: 'claude' | 'codex') {
    // Credential files are scoped to the test's private directory, never the user's HOME.
    await this.execute(
      `umask 077; mkdir -p ${quoteGuest(`${this.directory}/${provider}-home`)}; printf '%s' '${provider === 'claude' ? '{"ANTHROPIC_API_KEY":"orca-fake-test-key"}' : '{"OPENAI_API_KEY":"orca-fake-test-key"}'}' > ${quoteGuest(`${this.directory}/${provider}-home/auth.json`)}`
    )
  }

  async launchPid(provider: 'claude' | 'codex'): Promise<number | null> {
    const value = await this.execute(
      `if test -f ${quoteGuest(`${this.directory}/${provider}.launch`)}; then cat ${quoteGuest(`${this.directory}/${provider}.launch`)}; fi`
    )
    return /^\d+$/u.test(value) ? Number(value) : null
  }

  async providerProcessCounts(): Promise<{ claude: number; codex: number }> {
    return JSON.parse(
      await this.execute(`python3 - <<'PY'
import json, pathlib
counts = {'claude': 0, 'codex': 0}
for entry in pathlib.Path('/proc').iterdir():
 if not entry.name.isdigit(): continue
 try:
  args = (entry / 'cmdline').read_bytes().split(b'\\0')[:2]
  names = [pathlib.Path(arg.decode(errors='replace')).name for arg in args]
  for provider in counts:
   if provider in names or provider + '-code' in names: counts[provider] += 1
 except (OSError, ValueError): pass
print(json.dumps(counts))
PY`)
    ) as { claude: number; codex: number }
  }

  async credentialSessionPresent(provider: 'claude' | 'codex'): Promise<boolean> {
    const key = provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
    return (
      (await this.execute(`python3 - <<'PY'
import pathlib
present = False
for entry in pathlib.Path('/proc').iterdir():
 if not entry.name.isdigit(): continue
 try:
  if b'${key}=orca-fake-test-key' in (entry / 'environ').read_bytes().split(b'\\0'): present = True
 except OSError: pass
print('present' if present else 'absent')
PY`)) === 'present'
    )
  }

  async removeFixtures() {
    if (this.connected) {
      await this.execute(`rm -rf -- ${quoteGuest(this.directory)}`)
    }
  }

  async disconnect() {
    if (!this.connected) {
      this.client.end()
      return
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.client.destroy()
        resolve()
      }, 5_000)
      this.client.once('close', () => {
        clearTimeout(timeout)
        resolve()
      })
      this.client.end()
    })
  }
}

export class CorporateVmSentinel {
  readonly requests: { capability: 'claude' | 'codex' | 'scm'; timestamp: string }[] = []
  private server: Server | null = null
  private root = mkdtempSync(path.join(tmpdir(), 'orca-vm-sentinel-'))
  port = 0

  get hostPort(): number {
    const address = this.server?.address()
    if (!address || typeof address === 'string') {
      throw new Error('Sentinel is not listening')
    }
    return address.port
  }

  async start(guest: CorporateVmGuest) {
    const work = path.join(this.root, 'work')
    const bare = path.join(this.root, 'scm')
    for (const args of [
      ['init', '--bare', bare],
      ['init', work],
      [
        '-C',
        work,
        '-c',
        'user.name=Corporate fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '--allow-empty',
        '-m',
        'fixture'
      ],
      ['-C', work, 'push', bare, 'HEAD:refs/heads/main'],
      ['--git-dir', bare, 'update-server-info']
    ]) {
      const result = await runProcess({
        program: 'git',
        args,
        timeoutMs: 30_000,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: path.join(this.root, 'no-global-config')
        }
      })
      if (result.code !== 0) {
        throw new Error('Local SCM sentinel fixture creation failed')
      }
    }
    this.server = createServer((request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      const capability =
        pathname === '/claude'
          ? 'claude'
          : pathname === '/codex'
            ? 'codex'
            : pathname.startsWith('/scm/')
              ? 'scm'
              : null
      if (!capability) {
        response.writeHead(404).end()
        return
      }
      this.requests.push({ capability, timestamp: new Date().toISOString() })
      if (capability !== 'scm') {
        response.end('ok')
        return
      }
      const file = path.resolve(this.root, `.${decodeURIComponent(pathname)}`)
      if (!file.startsWith(`${bare}${path.sep}`) || !existsSync(file)) {
        response.writeHead(404).end()
        return
      }
      response.end(readFileSync(file))
    })
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    guest.client.removeAllListeners('tcp connection')
    guest.client.on('tcp connection', (_details, accept) => {
      const stream = accept()
      const request = createConnectionToSentinel(this.server!, stream)
      request.on('error', () => stream.destroy())
    })
    this.port = await new Promise<number>((resolve, reject) => {
      guest.client.forwardIn('127.0.0.1', 0, (error, port) =>
        error ? reject(new Error('VM sentinel reverse SSH forwarding unavailable')) : resolve(port)
      )
    })
  }

  async stop() {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    }
    rmSync(this.root, { recursive: true, force: true })
  }
}

function createConnectionToSentinel(server: Server, stream: ClientChannel) {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Sentinel is not listening')
  }
  const socket = connectSocket(address.port, '127.0.0.1')
  stream.pipe(socket).pipe(stream)
  stream.on('close', () => socket.destroy())
  return socket
}
