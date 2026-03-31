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

REM Ask for installation directory
echo.
echo Where would you like to install TensionAI-MCP?
echo (Press Enter for default: D:\TensionAI-MCP)
echo.
set /p INSTALL_DIR="Installation directory: "
if "%INSTALL_DIR%"=="" set INSTALL_DIR=D:\TensionAI-MCP

echo.
echo Installing to: %INSTALL_DIR%
echo.

REM Create installation directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Check for Bun
echo [1/7] Checking for Bun...
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
    echo [2/7] Downloading Bun...
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
echo [3/7] Checking for Git...
where git >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Git is not installed!
    echo Please install Git from: https://git-scm.com
    pause
    exit /b 1
)

REM Clone or update repository
echo [4/7] Setting up TensionAI-MCP...

if exist "%INSTALL_DIR%\tensionai-mcp" (
    echo Repository already exists at %INSTALL_DIR%\tensionai-mcp
    set REPO_DIR=%INSTALL_DIR%\tensionai-mcp
) else (
    echo Cloning repository...
    git clone https://github.com/Press-1-for-AI/tensionai-mcp.git "%INSTALL_DIR%\tensionai-mcp"
    set REPO_DIR=%INSTALL_DIR%\tensionai-mcp
)

cd /d "%REPO_DIR%"

REM Copy .env.example to .env if needed
if not exist ".env" (
    echo.
    echo NOTE: Please add your API key to .env
    echo Example: OPENAI_API_KEY=sk-your-key-here
    copy .env.example .env
)

REM Install dependencies
echo [5/7] Installing dependencies...
call "%INSTALL_DIR%\bun\bun.exe" install

REM Ask which IDE to configure
echo.
echo [6/7] IDE Integration
echo Which IDE would you like to configure?
echo   1) Cursor
echo   2) Roo Code  
echo   3) Claude Desktop
echo   4) All of the above
echo   5) None
echo.
set /p IDE_CHOICE="Enter choice (1-5): "

if "%IDE_CHOICE%"=="1" goto :setup_cursor
if "%IDE_CHOICE%"=="2" goto :setup_roo
if "%IDE_CHOICE%"=="3" goto :setup_claude
if "%IDE_CHOICE%"=="4" goto :setup_all
goto :skip_ide

:setup_cursor
echo Setting up Cursor...
powershell -Command "$config = Get-Content '%REPO_DIR%\mcp-servers\cursor.json' -Raw | ConvertFrom-Json; $mcpServers = @{}}; if (Test-Path '$env:APPDATA\Cursor\User\globalStorage\yaoweibin-mcp-settings\settings.json') { $mcpServers = (Get-Content '$env:APPDATA\Cursor\User\globalStorage\yaoweibin-mcp-settings\settings.json' | ConvertFrom-Json).mcpServers }; $mcpServers | Add-Member -NotePropertiesName 'tensionai-mcp' -NotePropertiesValue $config.mcpServers.'tensionai-mcp' -Force; @{$globalSettings=@{mcpServers=$mcpServers}} | ConvertTo-Json -Depth 10 | Set-Content '$env:APPDATA\Cursor\User\globalStorage\yaoweibin-mcp-settings\settings.json'"
echo Cursor configured!
goto :ide_done

:setup_roo
echo Setting up Roo Code...
powershell -Command "$config = Get-Content '%REPO_DIR%\mcp-servers\roo-code.json' -Raw | ConvertFrom-Json; $mcpServers = @{}}; if (Test-Path '$env:APPDATA\Code\User\globalStorage\yaoweibin-mcp-settings\settings.json') { $mcpServers = (Get-Content '$env:APPDATA\Code\User\globalStorage\yaoweibin-mcp-settings\settings.json' | ConvertFrom-Json).mcpServers }; $mcpServers | Add-Member -NotePropertiesName 'tensionai-mcp' -NotePropertiesValue $config.mcpServers.'tensionai-mcp' -Force; @{$globalSettings=@{mcpServers=$mcpServers}} | ConvertTo-Json -Depth 10 | Set-Content '$env:APPDATA\Code\User\globalStorage\yaoweibin-mcp-settings\settings.json'"
echo Roo Code configured!
goto :ide_done

:setup_claude
echo Setting up Claude Desktop...
powershell -Command "$config = Get-Content '%REPO_DIR%\mcp-servers\claude-desktop.json' -Raw | ConvertFrom-Json; $mcpServers = @{}}; if (Test-Path '$env:APPDATA\Claude\settings.json') { $mcpServers = (Get-Content '$env:APPDATA\Claude\settings.json' | ConvertFrom-Json).mcpServers }; $mcpServers | Add-Member -NotePropertiesName 'tensionai-mcp' -NotePropertiesValue $config.mcpServers.'tensionai-mcp' -Force; @{mcpServers=$mcpServers} | ConvertTo-Json -Depth 10 | Set-Content '$env:APPDATA\Claude\settings.json'"
echo Claude Desktop configured!
goto :ide_done

:setup_all
echo Setting up all IDEs...
powershell -Command "$config = Get-Content '%REPO_DIR%\mcp-servers\cursor.json' -Raw | ConvertFrom-Json; $mcpServers = @{}; $mcpServers | Add-Member -NotePropertiesName 'tensionai-mcp' -NotePropertiesValue $config.mcpServers.'tensionai-mcp' -Force; @{$globalSettings=@{mcpServers=$mcpServers}} | ConvertTo-Json -Depth 10 | Set-Content '$env:APPDATA\Cursor\User\globalStorage\yaoweibin-mcp-settings\settings.json'" 2>nul
powershell -Command "$config = Get-Content '%REPO_DIR%\mcp-servers\roo-code.json' -Raw | ConvertFrom-Json; $mcpServers = @{}; $mcpServers | Add-Member -NotePropertiesName 'tensionai-mcp' -NotePropertiesValue $config.mcpServers.'tensionai-mcp' -Force; @{$globalSettings=@{mcpServers=$mcpServers}} | ConvertTo-Json -Depth 10 | Set-Content '$env:APPDATA\Code\User\globalStorage\yaoweibin-mcp-settings\settings.json'" 2>nul
powershell -Command "$config = Get-Content '%REPO_DIR%\mcp-servers\claude-desktop.json' -Raw | ConvertFrom-Json; $mcpServers = @{}; $mcpServers | Add-Member -NotePropertiesName 'tensionai-mcp' -NotePropertiesValue $config.mcpServers.'tensionai-mcp' -Force; @{mcpServers=$mcpServers} | ConvertTo-Json -Depth 10 | Set-Content '$env:APPDATA\Claude\settings.json'" 2>nul
echo All IDEs configured!
goto :ide_done

:skip_ide
echo Skipping IDE configuration.

:ide_done

REM Create shortcut on desktop
echo [7/7] Creating desktop shortcut...
powershell -Command "$WScriptShell = New-Object -ComObject WScript.Shell; $Shortcut = $WScriptShell.CreateShortcut('%USERPROFILE%\Desktop\TensionAI-MCP.lnk'); $Shortcut.TargetPath = 'cmd.exe'; $Shortcut.Arguments = '/k cd /d %REPO_DIR%'; $Shortcut.WorkingDirectory = '%REPO_DIR%'; $Shortcut.Description = 'TensionAI-MCP'; $Shortcut.Save()"

echo.
echo ================================================
echo Installation Complete!
echo ================================================
echo.
echo Installed to: %REPO_DIR%
echo.
echo Next steps:
echo 1. Edit .env and add your API key
echo 2. Restart your IDE
echo 3. The MCP server will be available in the IDE
echo.
echo To start manually:
echo   cd %REPO_DIR%
echo   bun run mcp
echo.

pause
