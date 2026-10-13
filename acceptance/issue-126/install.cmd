@echo off
set ORCA_BACKGROUND_LAUNCH=1
powershell.exe -NoLogo -NoProfile -Command "& ([scriptblock]::Create([IO.File]::ReadAllText('%~dp0guest-install-retest.ps1')))"
