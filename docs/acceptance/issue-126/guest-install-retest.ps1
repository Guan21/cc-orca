param(
  [switch]$OrdinaryOnly,
  [string]$OutputDirectory = '\\VBOXSVR\DevCrew126Output'
)
$ErrorActionPreference = 'Stop'
$share = '\\VBOXSVR\SecureOrcaLite\Issue126'
$output = $OutputDirectory
New-Item -ItemType Directory -Force $output | Out-Null
Get-ChildItem Env: | Where-Object { $_.Name -like 'ORCA_E2E_*' -or $_.Name -in @('ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'ORCA_BYPASS_SINGLE_INSTANCE_LOCK', 'NODE_OPTIONS') } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
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
  if (-not $OrdinaryOnly) {
    $setup = Start-Process $installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    Save-Result 'install' @{exitCode=$setup.ExitCode; sourceSHA=$manifest.sourceSHA; installerSHA256=$digest}
    if ($setup.ExitCode -ne 0) { throw 'Silent installer failed' }
  }
  $exe = Join-Path $env:LOCALAPPDATA 'Programs\orca\DevCrew.exe'
  $profilePath = Join-Path $env:LOCALAPPDATA 'Programs\orca\resources\app.asar.unpacked\out\package.json'
  $profile = Get-Content $profilePath -Raw | ConvertFrom-Json
  if ($profile.orcaBuildProfile -ne 'corporate') { throw 'Installed build profile is not Corporate' }
  $asar = Join-Path $env:LOCALAPPDATA 'Programs\orca\resources\app.asar'
  $installedExeSHA256 = (Get-FileHash $exe -Algorithm SHA256).Hash
  $installedAsarSHA256 = (Get-FileHash $asar -Algorithm SHA256).Hash
  Save-Result 'installed-hashes' @{exeSHA256=$installedExeSHA256; asarSHA256=$installedAsarSHA256; profile=$profile.orcaBuildProfile}
  if ($installedExeSHA256 -ne $manifest.exeSHA256 -or $installedAsarSHA256 -ne $manifest.asarSHA256) { throw 'Installed executable or ASAR differs from source-pinned build' }
  $probeExitCode = 0
  if (-not $OrdinaryOnly) {
    $env:ELECTRON_RUN_AS_NODE = '1'
    $arguments = @("`"$share\guest-settings-egress.cjs`"", "`"$exe`"", "`"$output`"", '"\\VBOXSVR\SecureOrcaLite\Phase2-Issue119-e6748f1-20261012\playwright-core"')
    $probe = Start-Process $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $output 'probe-stdout.log') -RedirectStandardError (Join-Path $output 'probe-stderr.log')
    $env:ELECTRON_RUN_AS_NODE = $null
    $probeExitCode = $probe.ExitCode
    Save-Result 'probe-exit' @{exitCode=$probeExitCode}
  }
  $env:ORCA_CORPORATE_RUNTIME_EGRESS_LOG_PATH = Join-Path $output 'ordinary-egress.jsonl'
  $env:ORCA_STARTUP_DIAGNOSTICS = '1'
  $ordinary = Start-Process $exe -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'ordinary-stdout.log') -RedirectStandardError (Join-Path $output 'ordinary-stderr.log')
  $rendererLoaded = $false
  for ($attempt = 0; $attempt -lt 18; $attempt++) {
    Start-Sleep -Seconds 5
    $ordinary.Refresh()
    $stream = [IO.File]::Open((Join-Path $output 'ordinary-stderr.log'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $reader = New-Object IO.StreamReader($stream)
    try { $startupLog = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $rendererLoaded = $startupLog.Contains('[startup] renderer-startup-hydration-done')
    if ($ordinary.HasExited -or $rendererLoaded) { break }
  }
  $bypassVariables = @(Get-ChildItem Env: | Where-Object { $_.Name -like 'ORCA_E2E_*' -or $_.Name -in @('ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'ORCA_BYPASS_SINGLE_INSTANCE_LOCK', 'NODE_OPTIONS') } | ForEach-Object Name)
  Save-Result 'ordinary-startup' @{alive=(-not $ordinary.HasExited); rendererLoaded=$rendererLoaded; debugArguments=$false; bypassEnvironmentVariables=$bypassVariables; background=$true; production=$true; profile=$profile.orcaBuildProfile; cleanup='normal Windows shutdown; no forced process termination'}
  if ($ordinary.HasExited -or -not $rendererLoaded) { throw 'Ordinary installed startup or renderer load failed' }
  if ($probeExitCode -ne 0) { throw 'Diagnostic acceptance failed; see probe artifacts' }
} catch {
  Save-Result 'failure' @{verdict='FAIL'; message=($_.Exception.Message -replace '[A-Z]:\\Users\\[^\\\s]+','<user>')}
  exit 1
}
