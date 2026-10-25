# Human-operator only. GitHub CLI is restricted here to REST /api/v3 paths.
# NO gh repo view, gh pr create, gh auth status or DevCrew application Source use.
# Neither this script nor its dry-run reads credentials, OS keyrings or secret env values.
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
Write-Host "Target: $repo (PRIVATE); seed: $seed"
Write-Host 'Planned REST only: GET user, POST user/repos, GET repository; push two branches; POST pulls.'
Write-Host 'No application GitHub Source/GraphQL, keyring/token inspection, or auto-merge.'
if (-not $Apply) {
  Write-Host 'DRY RUN ONLY. No authentication check, creation, push or PR has occurred.'
  exit 0
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue) -or
    -not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git and GitHub CLI are required; stop before creating anything.'
}

# A single explicitly approved account on github.com only.
# The REST user endpoint returns only the account login selected with --jq.
$login = (& gh api --hostname github.com user --jq '.login').Trim()
if ($login -ine $Owner) {
  throw "Unexpected GitHub account. Required operator: $Owner; no repo created."
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("devcrew-pilot-qa-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null
try {
  Get-ChildItem -LiteralPath $seed -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $work -Recurse -Force
  }

  # Prepare safe local contents before the irreversible remote creation request.
  & git -C $work init -b main
  & git -C $work add --all
  & git -C $work -c 'user.name=DevCrew QA Fixture' -c 'user.email=devcrew-qa@example.invalid' commit -m 'test(qa): seed isolated Personal Pilot fixture'

  # REST only. Any collision, inaccessible existing repo, 403 or failure is a STOP.
  # Never take over, delete, make public, or overwrite a pre-existing repository.
  $createArgs = @('--hostname', 'github.com', '--method', 'POST', 'user/repos',
    '-f', "name=$Name", '-f', 'description=Isolated non-secret DevCrew Personal Pilot QA',
    '-F', 'private=true', '-F', 'auto_init=false')
  $created = & gh api @createArgs | ConvertFrom-Json
  if (-not $created -or $created.full_name -ine $repo -or $created.private -ne $true) {
    throw 'STOP: created repository identity/privacy not verified; nothing pushed.'
  }

  # Independently GET canonical REST metadata BEFORE FIRST PUSH.
  $metadata = & gh api --hostname github.com "repos/$repo" | ConvertFrom-Json
  if (-not $metadata -or $metadata.full_name -ine $repo -or
      $metadata.private -ne $true -or $metadata.visibility -ine 'private') {
    throw 'STOP: repository is not independently verified PRIVATE; nothing pushed.'
  }
  Write-Host "Private repo verified (REST). Numeric repository ID: $($metadata.id)."

  & git -C $work remote add origin "https://github.com/$repo.git"
  & git -C $work push --set-upstream origin main
  & git -C $work switch -c pilot/one-pr
  Set-Content -LiteralPath (Join-Path $work 'pilot-note.md') -Encoding utf8 -Value 'Synthetic selected PR observation.'
  & git -C $work add pilot-note.md
  & git -C $work -c 'user.name=DevCrew QA Fixture' -c 'user.email=devcrew-qa@example.invalid' commit -m 'test(qa): add single selected-PR observation'
  & git -C $work push --set-upstream origin pilot/one-pr

  # Validate PRIVATE again before creating the PR.
  $metadata = & gh api --hostname github.com "repos/$repo" | ConvertFrom-Json
  if (-not $metadata -or $metadata.full_name -ine $repo -or
      $metadata.private -ne $true -or $metadata.visibility -ine 'private') {
    throw 'STOP: repository privacy changed or could not be verified; PR creation refused.'
  }
  $pullArgs = @('--hostname', 'github.com', '--method', 'POST', "repos/$repo/pulls",
    '-f', 'base=main', '-f', 'head=pilot/one-pr',
    '-f', 'title=Pilot: selected PR observation',
    '-f', 'body=Non-sensitive QA fixture. Keep unmerged. Not a DevCrew application Source authorization.')
  $pr = & gh api @pullArgs | ConvertFrom-Json
  if (-not $pr -or $pr.number -lt 1 -or $pr.base.ref -ne 'main' -or
      $pr.head.ref -ne 'pilot/one-pr' -or $pr.state -ne 'open') {
    throw 'STOP: unexpected PR response; investigate without creating another.'
  }
  Write-Host "Created PRIVATE QA repository: https://github.com/$repo"
  Write-Host "One open test PR: #$($pr.number); observed HEAD: $($pr.head.sha)"
  Write-Host 'Separately verify actual GitHub Action runs/Checks after they complete.'
  Write-Host 'No DevCrew app source operation or Owner security approval was performed.'
} finally {
  Write-Host "Local staging directory preserved for recovery: $work"
  Write-Host 'On failure: inspect partial remote state manually; NEVER rerun -Apply blindly.'
}
