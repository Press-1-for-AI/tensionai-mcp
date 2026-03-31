# Bun Installation Script for Windows
# Run this in PowerShell as Administrator or regular user

Write-Host "Installing Bun for Windows..." -ForegroundColor Cyan

# Check if Bun is already installed
if (Get-Command bun -ErrorAction SilentlyContinue) {
    Write-Host "Bun is already installed!" -ForegroundColor Green
    bun --version
    exit 0
}

# Method 1: Install script (official)
Write-Host "Running official Bun installer..." -ForegroundColor Yellow
irm bun.sh/install.ps1 | iex

# Verify installation
if (Get-Command bun -ErrorAction SilentlyContinue) {
    Write-Host "`nBun installed successfully!" -ForegroundColor Green
    bun --version
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. Copy .env.example to .env"
    Write-Host "  2. Add your API key to .env"
    Write-Host "  3. Run: bun run mcp"
} else {
    Write-Host "`nBun installation failed. Trying alternative method..." -ForegroundColor Yellow
    
    # Method 2: Manual download
    $tempDir = "$env:TEMP\bun_install"
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
    
    $bunZip = "$tempDir\bun-windows-x64.zip"
    $bunExe = "$tempDir\bun.exe"
    
    Write-Host "Downloading Bun..." -ForegroundColor Yellow
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
    Write-Host "Please restart your terminal and run this script again to verify." -ForegroundColor Yellow
}
