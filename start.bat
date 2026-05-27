@echo off
cd /d "%~dp0"
rem Uses FinBook-Pro\Upload\Data first, then this path if set:
set LEDGERMITRA_LEGACY_DATA=F:\FinBook-Pro\Upload\Data
call npm run dev
