$ErrorActionPreference = 'Stop'
$share = '\\VBOXSVR\SecureOrcaLite\Issue126'
$output = '\\VBOXSVR\DevCrew126Output'
$env:ORCA_BACKGROUND_LAUNCH = '1'
$env:NODE_ENV = 'production'
function Save-Result($name, $value) {
  [IO.File]::WriteAllText((Join-Path $output "$name.json"), ($value | ConvertTo-Json -Depth 8))
}
try {
  $manifest = Get-Content (Join-Path $share 'build-manifest.json') -Raw | ConvertFrom-Json
  $installer = Join-Path $share 'devcrew-windows-setup.exe'
  $digest = (Get-FileHash $installer -Algorithm SHA256).Hash
  if ($digest -ne $manifest.installerSHA256) { throw 'Installer does not match exact-source manifest' }
  $setup = Start-Process $installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  Save-Result 'install' @{exitCode=$setup.ExitCode; sourceSHA=$manifest.sourceSHA; installerSHA256=$digest}
  if ($setup.ExitCode -ne 0) { throw 'Silent installer failed' }
  $exe = Join-Path $env:LOCALAPPDATA 'Programs\orca\DevCrew.exe'
  $profilePath = Join-Path $env:LOCALAPPDATA 'Programs\orca\resources\app.asar.unpacked\out\package.json'
  $profile = Get-Content $profilePath -Raw | ConvertFrom-Json
  if ($profile.orcaBuildProfile -ne 'corporate') { throw 'Installed build profile is not Corporate' }
  $env:ORCA_CORPORATE_RUNTIME_EGRESS_LOG_PATH = Join-Path $output 'ordinary-egress.jsonl'
  $ordinary = Start-Process $exe -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'ordinary-stdout.log') -RedirectStandardError (Join-Path $output 'ordinary-stderr.log')
  Start-Sleep -Seconds 30
  $ordinary.Refresh()
  Save-Result 'ordinary-startup' @{alive=(-not $ordinary.HasExited); debugArguments=$false; background=$true; production=$true; profile=$profile.orcaBuildProfile}
  if ($ordinary.HasExited) { throw 'Ordinary installed startup exited' }
  Stop-Process -Id $ordinary.Id
  Start-Sleep -Seconds 3
  $env:ELECTRON_RUN_AS_NODE = '1'
  $arguments = @("`"$share\guest-settings-egress.cjs`"", "`"$exe`"", "`"$output`"", '"\\VBOXSVR\SecureOrcaLite\Phase2-Issue119-e6748f1-20261012\playwright-core"')
  $probe = Start-Process $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $output 'probe-stdout.log') -RedirectStandardError (Join-Path $output 'probe-stderr.log')
  $env:ELECTRON_RUN_AS_NODE = $null
  Save-Result 'probe-exit' @{exitCode=$probe.ExitCode}
} catch {
  Save-Result 'failure' @{verdict='FAIL'; message=($_.Exception.Message -replace '[A-Z]:\\Users\\[^\\\s]+','<user>')}
}
