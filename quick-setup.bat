@echo off
echo ========================================
echo Open Interview Coder - Data Setup
echo ========================================
echo.
echo Creating data folders...
echo.

set APPDATA_PATH=%APPDATA%\open-interview-coder\data

echo Base path: %APPDATA_PATH%
echo.

mkdir "%APPDATA_PATH%\EURUSD" 2>nul
mkdir "%APPDATA_PATH%\GBPUSD" 2>nul
mkdir "%APPDATA_PATH%\USDJPY" 2>nul
mkdir "%APPDATA_PATH%\XAUUSD" 2>nul
mkdir "%APPDATA_PATH%\BTCUSD" 2>nul
mkdir "%APPDATA_PATH%\US30" 2>nul
mkdir "%APPDATA_PATH%\NAS100" 2>nul
mkdir "%APPDATA_PATH%\SPX500" 2>nul
mkdir "%APPDATA_PATH%\default" 2>nul

echo ✓ Folders created!
echo.
echo ========================================
echo Next Steps:
echo ========================================
echo.
echo 1. Place your chart images in the folders:
echo    - daily.png (daily timeframe chart)
echo    - 1hour.png (1-hour timeframe chart)
echo.
echo 2. Example for Gold (XAUUSD):
echo    %APPDATA_PATH%\XAUUSD\daily.png
echo    %APPDATA_PATH%\XAUUSD\1hour.png
echo.
echo 3. Opening data folder now...
echo.

start "" "%APPDATA_PATH%"

pause