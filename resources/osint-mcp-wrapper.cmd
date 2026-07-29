@echo off
setlocal
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "SERVER=%~dp0osint_mcp_server.py"

where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%SERVER%"
  exit /b %errorlevel%
)

where python >nul 2>nul
if not errorlevel 1 (
  python "%SERVER%"
  exit /b %errorlevel%
)

echo Python 3 was not found. Install Python 3 and restart the MCP server. 1>&2
exit /b 1
