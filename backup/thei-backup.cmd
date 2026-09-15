@echo off
rem Launcher for the Thei backup client. Double-click for the menu, or pass
rem flags through: thei-backup.cmd --run --auto
node "%~dp0thei-backup.mjs" %*
