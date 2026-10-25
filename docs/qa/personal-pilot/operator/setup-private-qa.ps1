# Use PowerShell 7, with Git and gh CLI already configured by the human operator.
# This script does not inspect tokens/keyrings or call DevCrew application Source.
[CmdletBinding()]
param(
  [string]$Owner = 'Guan21',
  [string]$Name = 'devcrew-personal-pilot-qa',
  [switch]$Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

if ($Owner -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$' -or
    $Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$') {
  throw 'Invalid repository owner/name'
}
$repo = "$Owner/$Name"
$seed = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../repo-seed')).Path
Write-Host "Target: $repo (PRIVATE); input: $seed"
Write-Host 'Actions: create PRIVATE repo, push safe main and a single unmerged test PR.'
Write-Host 'Will not inspect secrets/keyring or execute DevCrew app Source.'
if (-not $Apply) {
  Write-Host 'DRY RUN ONLY. Review target and then explicitly rerun with -Apply.'
  exit 0
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue) -or
    -not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git and GitHub CLI are required.'
}

# Never overwrite an existing remote. The create operation fails on name collision.
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("devcrew-pilot-qa-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null
try {
  Get-ChildItem -LiteralPath $seed -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $work -Recurse -Force
  }
  & git -C $work init -b main
  & git -C $work add --all
  & git -C $work commit -m 'test: seed isolated Personal Pilot QA'
  & gh repo create $repo --private --source $work --remote origin --push --description 'Isolated non-secret DevCrew Personal Pilot QA'
  $visibility = (& gh repo view $repo --json visibility --jq '.visibility').Trim()
  if ($visibility -ine 'PRIVATE') {
    throw 'STOP: PRIVATE visibility is not verified; PR creation refused.'
  }
  & git -C $work switch -c pilot/one-pr
  Set-Content -LiteralPath (Join-Path $work 'pilot-note.md') -Encoding utf8 -Value 'Synthetic selected PR observation.'
  & git -C $work add pilot-note.md
  & git -C $work commit -m 'test: selected PR fixture HEAD'
  & git -C $work push --set-upstream origin pilot/one-pr
  & gh pr create --repo $repo --base main --head pilot/one-pr --title 'Pilot: selected PR observation' --body 'Non-sensitive QA fixture. Keep unmerged. Not a DevCrew app Source authorization.'
  Write-Host "Created isolated PRIVATE QA repo/PR: https://github.com/$repo"
  Write-Host 'Record only repo, PR number, HEAD SHA and Check states. Never paste tokens or keyring info.'
} finally {
  Write-Host "Local temp directory is preserved for recovery: $work"
}
