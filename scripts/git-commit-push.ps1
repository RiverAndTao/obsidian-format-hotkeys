# Commit + push without Cursor Co-authored-by trailer.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/git-commit-push.ps1 -Message "commit message"

param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [string]$Remote = "origin",

    [string]$Branch = ""
)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
}

git add -A
$status = git status --porcelain
if (-not $status) {
    Write-Host "Nothing to commit."
    exit 0
}

$authorName = (git log -1 --format=%an).Trim()
$authorEmail = (git log -1 --format=%ae).Trim()
if (-not $authorName) { $authorName = "RiverAndTao" }
if (-not $authorEmail) { $authorEmail = "1316683725@qq.com" }

$msgFile = Join-Path $env:TEMP ("fh-commit-msg-{0}.txt" -f [guid]::NewGuid().ToString("N"))
# Normalize to LF single paragraph + trailing newline; never append Co-authored-by
$clean = ($Message -replace "`r`n", "`n" -replace "`r", "`n").Trim() + "`n"
[System.IO.File]::WriteAllText($msgFile, $clean, [System.Text.UTF8Encoding]::new($false))

try {
    $tree = (git write-tree).Trim()
    $parent = (git rev-parse HEAD).Trim()

    $env:GIT_AUTHOR_NAME = $authorName
    $env:GIT_AUTHOR_EMAIL = $authorEmail
    $env:GIT_COMMITTER_NAME = $authorName
    $env:GIT_COMMITTER_EMAIL = $authorEmail

    $newCommit = (git commit-tree $tree -p $parent -F $msgFile).Trim()
    if (-not $newCommit) {
        throw "git commit-tree failed"
    }

    git reset --hard $newCommit | Out-Null

    $body = git log -1 --format=%B
    if ($body -match "(?i)Co-authored-by:\s*Cursor") {
        throw "Commit still contains Co-authored-by: Cursor; aborting push."
    }

    Write-Host "Committed $($newCommit.Substring(0, 7)) as $authorName <$authorEmail>"
    git push $Remote $Branch
    Write-Host "Pushed to $Remote/$Branch"
}
finally {
    Remove-Item -Force $msgFile -ErrorAction SilentlyContinue
}
