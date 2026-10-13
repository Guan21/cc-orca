@echo off
powershell.exe -NoLogo -NoProfile -Command "& ([scriptblock]::Create([IO.File]::ReadAllText('%~dp0guest-retry.ps1')))"