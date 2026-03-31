; TensionAI-MCP Inno Setup Script

#define MyAppName "TensionAI-MCP"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Press-1-for-AI"
#define MyAppURL "https://github.com/Press-1-for-AI/tensionai-mcp"

[Setup]
AppId={{B8F2E8A1-5C3D-4E9F-A6B7-1C2D3E4F5A6B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={commonpf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\installer
OutputBaseFilename=TensionAI-MCP-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{cmd}"; Parameters: "/k cd /d {app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{cmd}"; Parameters: "/k cd /d {app}"; Tasks: desktopicon

[Run]
; Download and install Bun
Filename: "powershell"; Parameters: "-Command Invoke-WebRequest -Uri 'https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip' -OutFile '$env:TEMP\bun.zip'; Expand-Archive -Path '$env:TEMP\bun.zip' -DestinationPath '$env:TEMP\bun' -Force; Copy-Item -Path '$env:TEMP\bun\bun.exe' -Destination '{app}\bun.exe' -Force"; StatusMsg: "Installing Bun runtime..."; Flags: runhidden waituntilterminated

; Run bun install
Filename: "{cmd}"; Parameters: "/c cd /d {app} && {app}\bun.exe install"; StatusMsg: "Installing dependencies..."; Flags: runhidden waituntilterminated

[Code]
var
  InstallDirPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  InstallDirPage := CreateInputDirPage(wpSelectDir,
    'Installation Directory', 'Where should TensionAI-MCP be installed?',
    'Select the folder in which to install TensionAI-MCP.', False, '');
  InstallDirPage.Add('');
  InstallDirPage.Values[0] := ExpandConstant('{commonpf}\TensionAI-MCP');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  envFile: TStringList;
  InstallDir: string;
begin
  if CurStep = ssPostInstall then
  begin
    InstallDir := InstallDirPage.Values[0];
    
    // Copy .env.example to .env
    if not FileExists(InstallDir + '\.env') then
    begin
      CopyFile(ExpandConstant(InstallDir + '\.env.example'), InstallDir + '\.env', False);
    end;
  end;
end;
