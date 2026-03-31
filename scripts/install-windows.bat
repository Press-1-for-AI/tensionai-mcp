@echo off
REM TensionAI-MCP Windows Installer
REM Run this as Administrator for best results

echo ================================================
echo TensionAI-MCP Installer for Windows
echo ================================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo WARNING: Not running as Administrator.
    echo Some features may require elevation.
    echo.
)

REM Create installation directory
set INSTALL_DIR=%LOCALAPPDATA%\TensionAI-MCP
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Check for Bun
echo [1/5] Checking for Bun...
where bun >nul 2>&1
if %errorLevel% equ 0 (
    echo Bun is already installed!
    set BUN_FOUND=1
) else (
    echo Bun not found. Installing...
    set BUN_FOUND=0
)

REM Install Bun if needed
if %BUN_FOUND% equ 0 (
    echo [2/5] Downloading Bun...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip' -OutFile '%TEMP%\bun.zip'"
    
    echo Extracting Bun...
    powershell -Command "Expand-Archive -Path '%TEMP%\bun.zip' -DestinationPath '%TEMP%\bun' -Force"
    
    if not exist "%INSTALL_DIR%\bun" mkdir "%INSTALL_DIR%\bun"
    copy /y "%TEMP%\bun\bun.exe" "%INSTALL_DIR%\bun\" >nul
    
    echo Adding Bun to PATH...
    setx PATH "%PATH%;%INSTALL_DIR%\bun" >nul 2>&1
    set PATH=%PATH%;%INSTALL_DIR%\bun
    
    echo Bun installed to %INSTALL_DIR%\bun
)

REM Check for Git
echo [3/5] Checking for Git...
where git >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Git is not installed!
    echo Please install Git from: https://git-scm.com
    pause
    exit /b 1
)

REM Clone or update repository
echo [4/5] Setting up TensionAI-MCP...

if exist "d:\cursor\tensionai-mcp" (
    echo Repository already exists at d:\cursor\tensionai-mcp
) else (
    echo Cloning repository...
    cd /d D:\
    if not exist "d:\cursor" mkdir "d:\cursor"
    git clone https://github.com/Press-1-for-AI/tensionai-mcp.git d:\cursor\tensionai-mcp
)

cd /d d:\cursor\tensionai-mcp

REM Copy .env.example to .env if needed
if not exist ".env" (
    echo.
    echo NOTE: Please add your API key to .env
    echo Example: OPENAI_API_KEY=sk-your-key-here
    copy .env.example .env
)

REM Install dependencies
echo [5/5] Installing dependencies...
call "%INSTALL_DIR%\bun\bun.exe" install

echo.
echo ================================================
echo Installation Complete!
echo ================================================
echo.
echo Next steps:
echo 1. Edit .env and add your API key
echo 2. Run: bun run mcp
echo.
echo To start the MCP server:
echo   cd d:\cursor\tensionai-mcp
echo   bun run mcp
echo.

pause
