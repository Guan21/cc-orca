import { isIP } from 'node:net'
import {
  classifyGuestAttempt,
  parseGuestGuardSnapshot,
  type GuestEndpoint,
  type GuestDestination,
  type GuestObservationContext,
  type VmRuntimeEgressAttempt
} from './guest-egress-evidence'
export { classifyGuestAttempt, parseGuestGuardSnapshot } from './guest-egress-evidence'
export type {
  GuestEndpoint,
  GuestObservationContext,
  VmRuntimeEgressAttempt
} from './guest-egress-evidence'

type GuardConfiguration = {
  sessionId: string
  controlEndpoints: GuestEndpoint[]
  sentinel: GuestEndpoint
}

function validateConfiguration(input: GuardConfiguration): void {
  if (!/^[a-zA-Z0-9]{1,12}$/.test(input.sessionId)) {
    throw new Error('Invalid guard session ID')
  }
  for (const endpoint of [input.sentinel, ...input.controlEndpoints]) {
    if (
      !isIP(endpoint.address) ||
      !Number.isInteger(endpoint.port) ||
      endpoint.port < 1 ||
      endpoint.port > 65535 ||
      !['tcp', 'udp'].includes(endpoint.protocol)
    ) {
      throw new Error('Guard requires an exact IP/port endpoint')
    }
  }
}

export function buildGuestGuardScripts(input: GuardConfiguration): {
  install: string
  read: string
  remove: string
} {
  validateConfiguration(input)
  const chain = `ORCA_EG_${input.sessionId}`
  const prefix = `ORCA_${input.sessionId}`
  const remove = [
    'set -eu',
    'for fw in iptables ip6tables; do',
    '  sudo -n "$fw" -w -S OUTPUT >/dev/null',
    '  sudo -n "$fw" -w -S FORWARD >/dev/null',
    `  sudo -n "$fw" -w -D OUTPUT -j ${chain} 2>/dev/null || true`,
    `  sudo -n "$fw" -w -D FORWARD -j ${chain} 2>/dev/null || true`,
    `  if sudo -n "$fw" -w -S ${chain} >/dev/null 2>&1; then`,
    `    sudo -n "$fw" -w -F ${chain}`,
    `    sudo -n "$fw" -w -X ${chain}`,
    '  fi',
    'done'
  ].join('\n')
  const rules: string[] = []
  for (const [fw, family] of [
    ['iptables', 4],
    ['ip6tables', 6]
  ] as const) {
    const append = (rule: string): void => {
      rules.push(`sudo -n ${fw} -w -A ${chain} ${rule}`)
    }
    rules.push(`sudo -n ${fw} -w -N ${chain}`)
    append('-m conntrack --ctstate ESTABLISHED,RELATED -j RETURN')
    if (isIP(input.sentinel.address) === family) {
      const match = `-d ${input.sentinel.address} -p ${input.sentinel.protocol} --dport ${input.sentinel.port}`
      append(
        `${match} -m conntrack --ctstate NEW -m comment --comment sentinel -j LOG --log-prefix "${prefix}_ALLOW "`
      )
      append(`${match} -j RETURN`)
    }
    append('-o lo -j RETURN')
    for (const endpoint of input.controlEndpoints.filter(
      (entry) => isIP(entry.address) === family
    )) {
      append(`-d ${endpoint.address} -p ${endpoint.protocol} --dport ${endpoint.port} -j RETURN`)
    }
    append(`-m comment --comment rejected -j LOG --log-prefix "${prefix}_DENY "`)
    append('-j REJECT')
    rules.push(`sudo -n ${fw} -w -I OUTPUT 1 -j ${chain}`)
    rules.push(`sudo -n ${fw} -w -I FORWARD 1 -j ${chain}`)
  }
  const install = [
    'set -eu',
    'command -v iptables >/dev/null',
    'command -v ip6tables >/dev/null',
    'sudo -n dmesg >/dev/null',
    `for fw in iptables ip6tables; do if sudo -n "$fw" -w -S ${chain} >/dev/null 2>&1; then exit 1; fi; done`,
    'cleanup() {',
    remove.replace('set -eu\n', ''),
    '}',
    'trap cleanup EXIT',
    ...rules,
    'trap - EXIT'
  ].join('\n')
  const read = [
    'set -eu',
    'for fw in iptables ip6tables; do',
    '  for hook in OUTPUT FORWARD; do',
    '    rules=$(sudo -n "$fw" -w -S "$hook")',
    '    first=$(printf "%s\\n" "$rules" | awk \'$1 == "-A" { print; exit }\')',
    `    test "$first" = "-A $hook -j ${chain}"`,
    '    printf "HOOK %s %s\\n" "$fw" "$hook"',
    '  done',
    `  table=$(sudo -n "$fw" -w -nvxL ${chain})`,
    `  expected=0; if [ "$fw" = '${isIP(input.sentinel.address) === 4 ? 'iptables' : 'ip6tables'}' ]; then expected=1; fi`,
    '  printf "%s\\n" "$table" | awk -v expected="$expected" \'index($0, "/* sentinel */") { a += $1; s++ } index($0, "/* rejected */") { b += $1; r++ } END { if (r != 1 || s != expected) exit 3; printf "COUNTER sentinel %.0f\\nCOUNTER rejected %.0f\\n", a, b }\'',
    'done',
    'kernel_log=$(sudo -n dmesg)',
    `printf "%s\\n" "$kernel_log" | grep -F '${prefix}_' || test "$?" -eq 1`,
    `printf 'GUARD_COMPLETE ${input.sessionId}\\n'`
  ].join('\n')
  return { install, read, remove }
}

export function createVmGuestEgressGuard(
  input: GuardConfiguration & {
    runtimeId: string
    execute: (script: string) => Promise<string>
  }
): {
  install: () => Promise<void>
  observe: (context: GuestObservationContext) => Promise<{
    attempts: VmRuntimeEgressAttempt[]
    unexpectedPackets: number
    sentinelPackets: number
    rejectedPackets: number
  }>
  remove: () => Promise<void>
} {
  const scripts = buildGuestGuardScripts(input)
  let installed = false
  let installationAttempted = false
  let previous = { sentinelPackets: 0, rejectedPackets: 0, destinations: [] as GuestDestination[] }
  return {
    async install() {
      // Refuse a preexisting chain before taking cleanup ownership of this random session ID.
      await input.execute(
        [
          'set -eu',
          'for fw in iptables ip6tables; do',
          'sudo -n "$fw" -w -S OUTPUT >/dev/null',
          'sudo -n "$fw" -w -S FORWARD >/dev/null',
          `if sudo -n "$fw" -w -S ORCA_EG_${input.sessionId} >/dev/null 2>&1; then exit 42; fi`,
          'done'
        ].join('\n')
      )
      installationAttempted = true
      await input.execute(scripts.install)
      installed = true
      // Rules start at zero; do not discard traffic occurring during installation.
    },
    async observe(context) {
      if (!installed) {
        throw new Error('Guest guard not installed')
      }
      const output = await input.execute(scripts.read)
      if (
        !output.trimEnd().endsWith(`GUARD_COMPLETE ${input.sessionId}`) ||
        output.match(/^COUNTER sentinel /gm)?.length !== 2 ||
        output.match(/^COUNTER rejected /gm)?.length !== 2
      ) {
        throw new Error('Guest firewall snapshot incomplete')
      }
      const hooks = output
        .split('\n')
        .filter((line) => line.startsWith('HOOK '))
        .sort()
      const expectedHooks = [
        'HOOK iptables OUTPUT',
        'HOOK iptables FORWARD',
        'HOOK ip6tables OUTPUT',
        'HOOK ip6tables FORWARD'
      ].sort()
      if (hooks.join('\n') !== expectedHooks.join('\n')) {
        throw new Error('Guest firewall hook integrity failure')
      }
      const next = parseGuestGuardSnapshot(output, input.sessionId)
      const sentinelPackets = next.sentinelPackets - previous.sentinelPackets
      const rejectedPackets = next.rejectedPackets - previous.rejectedPackets
      if (
        sentinelPackets < 0 ||
        rejectedPackets < 0 ||
        next.destinations.length < previous.destinations.length
      ) {
        throw new Error('Guest firewall evidence reset or truncated')
      }
      const newDestinations = next.destinations.slice(previous.destinations.length)
      const attempts = newDestinations.map((entry) =>
        classifyGuestAttempt({
          ...context,
          runtimeId: input.runtimeId,
          sentinel: input.sentinel,
          destination: { address: entry.address, port: entry.port, protocol: entry.protocol },
          disposition: entry.disposition
        })
      )
      let missing = 0
      for (const [disposition, packets] of [
        ['sentinel', sentinelPackets],
        ['rejected', rejectedPackets]
      ] as const) {
        const logged = newDestinations.filter((entry) => entry.disposition === disposition).length
        if (logged > packets) {
          throw new Error('Guest firewall logs do not match counters')
        }
        missing += packets - logged
      }
      if (missing) {
        attempts.push(
          classifyGuestAttempt({
            runtimeId: input.runtimeId,
            scenario: context.scenario,
            sentinel: input.sentinel,
            destination: null,
            disposition: 'rejected'
          })
        )
      }
      previous = next
      return {
        attempts,
        unexpectedPackets:
          missing + attempts.filter((entry) => !entry.expected && entry.destination).length,
        sentinelPackets,
        rejectedPackets
      }
    },
    async remove() {
      if (!installationAttempted) {
        return
      }
      await input.execute(scripts.remove)
      installed = false
      installationAttempted = false
    }
  }
}
