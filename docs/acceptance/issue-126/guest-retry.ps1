param([string]$OutputDirectory = '\\VBOXSVR\DevCrew126Output\attempt-5')
$ErrorActionPreference = 'Stop'
$share = '\\VBOXSVR\SecureOrcaLite\Issue126'
$output = $OutputDirectory
New-Item -ItemType Directory -Force $output | Out-Null
Get-ChildItem Env: | Where-Object { $_.Name -like 'ORCA_E2E_*' -or $_.Name -in @('ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'ORCA_BYPASS_SINGLE_INSTANCE_LOCK', 'NODE_OPTIONS') } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
$env:ORCA_BACKGROUND_LAUNCH = '1'
$env:NODE_ENV = 'production'
$exe = Join-Path $env:LOCALAPPDATA 'Programs\orca\DevCrew.exe'
$asar = Join-Path $env:LOCALAPPDATA 'Programs\orca\resources\app.asar'
$manifest = Get-Content (Join-Path $share 'build-manifest.json') -Raw | ConvertFrom-Json
if ((Get-FileHash $exe).Hash -ne $manifest.exeSHA256 -or (Get-FileHash $asar).Hash -ne $manifest.asarSHA256) { throw 'Installed hashes changed' }
$env:ELECTRON_RUN_AS_NODE = '1'
$arguments = @("`"$share\guest-settings-egress.cjs`"", "`"$exe`"", "`"$output`"", '"\\VBOXSVR\SecureOrcaLite\Phase2-Issue119-e6748f1-20261012\playwright-core"')
$probe = Start-Process $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $output 'probe-stdout.log') -RedirectStandardError (Join-Path $output 'probe-stderr.log')
[IO.File]::WriteAllText((Join-Path $output 'probe-exit.json'), (@{exitCode=$probe.ExitCode} | ConvertTo-Json))
$env:ELECTRON_RUN_AS_NODE = $null
exit $probe.ExitCode
