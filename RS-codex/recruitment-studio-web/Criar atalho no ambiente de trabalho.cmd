@echo off
rem Creates a "Recruitment Studio" shortcut (with the app icon) on the Desktop.
rem Run it again if the folder is moved.
setlocal
set "TARGET=%~dp0Recruitment Studio.exe"
if not exist "%TARGET%" (
  echo Nao encontrei "Recruitment Studio.exe" nesta pasta.
  pause
  exit /b 1
)
powershell -NoProfile -NonInteractive -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Recruitment Studio.lnk')); $s.TargetPath = $env:TARGET; $s.WorkingDirectory = (Split-Path $env:TARGET); $s.IconLocation = $env:TARGET + ',0'; $s.Description = 'Anuncios de recrutamento para Facebook e Instagram'; $s.Save()"
if errorlevel 1 (
  echo Nao foi possivel criar o atalho.
  pause
  exit /b 1
)
echo Atalho "Recruitment Studio" criado no ambiente de trabalho.
timeout /t 3 >nul
endlocal
