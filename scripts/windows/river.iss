; River installer for Windows 10/11. Built by `npm run package:win` with Inno Setup 6.
; Installs for the current user only, so no administrator prompt is needed.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
[Setup]
AppId={{6E0B7C1E-6A55-4C0F-9D0B-2B7C2F1A0E11}
AppName=River
AppVersion={#AppVersion}
AppVerName=River {#AppVersion}
AppPublisher=River contributors
DefaultDirName={localappdata}\Programs\River
DefaultGroupName=River
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=River-{#AppVersion}-windows-setup
SetupIconFile=..\..\public\River.ico
UninstallDisplayIcon={app}\River.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\River"; Filename: "{app}\River.exe"
Name: "{autodesktop}\River"; Filename: "{app}\River.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\River.exe"; Description: "Open River"; Flags: nowait postinstall skipifsilent
