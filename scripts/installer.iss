; TensionAI-MCP Inno Setup Script
; Download Inno Setup from https://jrsoftware.org/isdl.php to compile this

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
DefaultDirName={autopf}\{#MyAppName}
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
Name: "{group}\Open Terminal Here"; Filename: "{cmd}"; Parameters: "/k cd /d {app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{cmd}"; Parameters: "/k cd /d {app}"; Tasks: desktopicon

[Code]
var
  InstallDirPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  InstallDirPage := CreateInputDirPage(wpSelectDir,
    'Installation Directory', 'Where should TensionAI-MCP be installed?',
    'Select the folder in which to install TensionAI-MCP.', False, '');
  InstallDirPage.Add('');
  InstallDirPage.Values[0] := ExpandConstant('{pf}\TensionAI-MCP');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Copy .env.example to .env
    if not FileExists(ExpandConstant('{app}\.env')) then
    begin
      CopyFile(ExpandConstant('{app}\.env.example'), ExpandConstant('{app}\.env'), False);
    end;
  end;
end;
