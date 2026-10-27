@echo off
rem Opens Recruitment Studio in its own window (Microsoft Edge in app mode).
rem Everything runs from this folder; no internet connection is needed.
setlocal
if exist "%~dp0Recruitment Studio.exe" (
  start "" "%~dp0Recruitment Studio.exe"
  exit /b 0
)
set "APP=%~dp0index.html"
set "URL=file:///%APP:\=/%"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="%URL%" --window-size=1440,900
) else (
  start "" "%APP%"
)
endlocal
