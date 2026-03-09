@echo off
cd /d %~dp0..\frontend
set NODEJS=C:\Program Files\nodejs\npm.cmd
set PATH=%PATH%;C:\Program Files\nodejs\
if exist "%NODEJS%" (
  "%NODEJS%" install
  "%NODEJS%" run dev
) else (
  echo Node.js not found at %NODEJS%
  echo Install Node.js LTS from https://nodejs.org
)
