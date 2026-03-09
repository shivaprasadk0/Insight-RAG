@echo off
cd /d "%~dp0..\backend"
set PYTHON_EXE=

if exist "..\venv\Scripts\python.exe" (
  set PYTHON_EXE="..\venv\Scripts\python.exe"
)

if exist "..\..\venv\Scripts\python.exe" (
  set PYTHON_EXE="..\..\venv\Scripts\python.exe"
)

if not defined PYTHON_EXE (
  set PYTHON_EXE=python
)

%PYTHON_EXE% main.py
