# Bun Installation for Windows via Package Managers
# Run this in PowerShell

Write-Host "Installing Bun for Windows..." -ForegroundColor Cyan

# Check if Bun is already installed
if (Get-Command bun -ErrorAction SilentlyContinue) {
    Write-Host "Bun is already installed!" -ForegroundColor Green
    bun --version
    exit 0
}

# Try package managers in order of preference

# Method 1: Winget (recommended, comes with Windows 10/11)
Write-Host "Trying winget..." -ForegroundColor Yellow
if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id Oven.Bun --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Bun installed via winget!" -ForegroundColor Green
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")
        bun --version
        exit 0
    }
}

# Method 2: Chocolatey
Write-Host "Trying Chocolatey..." -ForegroundColor Yellow
if (Get-Command choco -ErrorAction SilentlyContinue) {
    choco install bun -y
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Bun installed via Chocolatey!" -ForegroundColor Green
        refreshenv
        bun --version
        exit 0
    }
}

# Method 3: Scoop
Write-Host "Trying Scoop..." -ForegroundColor Yellow
if (Get-Command scoop -ErrorAction SilentlyContinue) {
    scoop install bun
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Bun installed via Scoop!" -ForegroundColor Green
        bun --version
        exit 0
    }
}

# Method 4: Direct download (fallback)
Write-Host "Package managers not available. Downloading Bun directly..." -ForegroundColor Yellow

$tempDir = "$env:TEMP\bun_install"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$bunZip = "$tempDir\bun-windows-x64.zip"

Invoke-WebRequest -Uri "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip" -OutFile $bunZip

Write-Host "Extracting..." -ForegroundColor Yellow
Expand-Archive -Path $bunZip -DestinationPath $tempDir -Force

# Move to a permanent location
$bunDir = "$env:LOCALAPPDATA\bun"
New-Item -ItemType Directory -Force -Path $bunDir | Out-Null
Move-Item -Path "$tempDir\bun.exe" -Destination "$bunDir\bun.exe" -Force

# Add to PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$bunDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$bunDir", "User")
    Write-Host "Added Bun to PATH. You may need to restart your terminal." -ForegroundColor Yellow
}

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force

Write-Host "`nBun installed to: $bunDir" -ForegroundColor Green
Write-Host "Please restart your terminal to use Bun." -ForegroundColor Yellow
