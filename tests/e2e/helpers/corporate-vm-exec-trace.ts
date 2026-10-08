export type VmProviderExec = { process: 'claude' | 'codex' | 'node' | 'nodejs'; pid: number }

export function createVmProviderExecTrace(input: {
  sessionId: string
  execute: (script: string) => Promise<string>
}) {
  if (!/^[a-zA-Z0-9]{1,12}$/u.test(input.sessionId)) {
    throw new Error('Invalid process trace session ID')
  }
  const instance = `orca_egress_${input.sessionId}`
  let installed = false
  let installationAttempted = false
  const locate = `base=/sys/kernel/tracing
if ! sudo -n test -d "$base/instances"; then base=/sys/kernel/debug/tracing; fi
sudo -n test -d "$base/instances" || { printf 'Continuous VM exec observation requires existing Linux tracefs\\n' >&2; exit 1; }
instance="$base/instances/${instance}"`
  return {
    async install() {
      await input.execute(`set -eu\n${locate}\nsudo -n test ! -d "$instance"`)
      installationAttempted = true
      await input.execute(`set -eu
${locate}
sudo -n mkdir "$instance"
cleanup() { sudo -n sh -c 'echo 0 > "$1/tracing_on"; echo 0 > "$1/events/sched/sched_process_exec/enable"' sh "$instance"; sudo -n rmdir "$instance"; }
trap cleanup EXIT
sudo -n sh -c 'test -f "$1/events/sched/sched_process_exec/enable"; echo 0 > "$1/tracing_on"; echo 1024 > "$1/buffer_size_kb"; echo > "$1/trace"; echo 1 > "$1/events/sched/sched_process_exec/enable"; echo 1 > "$1/tracing_on"' sh "$instance"
trap - EXIT`)
      installed = true
    },
    async observeQuiet(): Promise<{ providerLaunches: VmProviderExec[]; overruns: number }> {
      if (!installed) {
        throw new Error('Continuous VM exec observation is not installed')
      }
      // Only sanitized executable names and PIDs leave the guest, never full trace records.
      const result = JSON.parse(
        await input.execute(`set -eu
${locate}
sudo -n python3 - "$instance" <<'PY'
import json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
if (root / 'tracing_on').read_text().strip() != '1' or (root / 'events/sched/sched_process_exec/enable').read_text().strip() != '1': raise RuntimeError('trace disabled')
def overruns():
 total = 0
 stats_files = list((root / 'per_cpu').glob('cpu*/stats'))
 if not stats_files: raise RuntimeError('trace stats unavailable')
 for stats in stats_files:
  values = {}
  for line in stats.read_text().splitlines():
   if line.startswith(('overrun:', 'commit overrun:', 'dropped events:')):
    key, value = line.split(':', 1); values[key] = int(value.strip())
  if 'overrun' not in values or 'commit overrun' not in values: raise RuntimeError('trace loss counters unavailable')
  total += sum(values.values())
 return total
lost_before = overruns()
launches = []
for line in (root / 'trace').read_text().splitlines():
 if 'sched_process_exec:' not in line: continue
 match = re.search(r'sched_process_exec: filename=(.*?) pid=(\\d+) old_pid=\\d+', line)
 if not match: raise RuntimeError('unparseable exec event')
 filename = re.sub(r'\\\\x([a-fA-F0-9]{2})|\\\\([0-7]{3})', lambda m: chr(int(m.group(1) or m.group(2), 16 if m.group(1) else 8)), match.group(1))
 name = pathlib.PurePosixPath(filename).name
 if name == 'claude-code': name = 'claude'
 if name in ('claude', 'codex', 'node', 'nodejs'): launches.append({'process': name, 'pid': int(match.group(2))})
print(json.dumps({'providerLaunches': launches, 'overruns': max(lost_before, overruns())}))
PY`)
      ) as { providerLaunches: VmProviderExec[]; overruns: number }
      if (
        !Number.isSafeInteger(result.overruns) ||
        result.overruns !== 0 ||
        !Array.isArray(result.providerLaunches)
      ) {
        throw new Error('Continuous VM process execution evidence lost or unavailable')
      }
      return result
    },
    async remove() {
      if (!installationAttempted) {
        return
      }
      await input.execute(`set -eu
${locate}
if sudo -n test -d "$instance"; then
 sudo -n sh -c 'echo 0 > "$1/tracing_on"; if test -f "$1/events/sched/sched_process_exec/enable"; then echo 0 > "$1/events/sched/sched_process_exec/enable"; fi' sh "$instance"
 sudo -n rmdir "$instance"
fi`)
      installed = false
      installationAttempted = false
    }
  }
}
