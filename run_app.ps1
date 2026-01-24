Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$lockFile = Join-Path $repoRoot "package-lock.json"
$nodeModules = Join-Path $repoRoot "node_modules"
$hashFile = Join-Path $repoRoot ".package-lock.hash"

function Get-LockHash {
    param([string]$Path)
    if (-Not (Test-Path $Path)) { return $null }
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash
}

$needsInstall = $false
if (-Not (Test-Path $nodeModules)) {
    $needsInstall = $true
} elseif (-Not (Test-Path $lockFile)) {
    $needsInstall = $true
} else {
    $currentHash = Get-LockHash -Path $lockFile
    $savedHash = if (Test-Path $hashFile) { (Get-Content $hashFile -Raw).Trim() } else { "" }
    if (-Not $savedHash -or $savedHash -ne $currentHash) {
        $needsInstall = $true
    }
}

if ($needsInstall) {
    Write-Host "Installing dependencies..."
    npm install
    if (Test-Path $lockFile) {
        $currentHash = Get-LockHash -Path $lockFile
        $currentHash | Set-Content -Path $hashFile -NoNewline
    }
} else {
    Write-Host "Dependencies up to date; skipping npm install."
}

Write-Host "Building app..."
npm run build

$distIndex = Join-Path $repoRoot "dist\index.html"
if (-Not (Test-Path $distIndex)) {
    throw "Build output not found at $distIndex"
}

Write-Host "Starting preview server..."
npm run preview
