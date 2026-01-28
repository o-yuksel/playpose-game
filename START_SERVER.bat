@echo off
echo ========================================
echo   Play Pose Game Server
echo ========================================
echo.

:: Check for Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found!
    echo.
    echo Please install Python: https://python.org/downloads
    echo.
    pause
    goto :end
)

:: Check if ytmusicapi is installed
python -c "import ytmusicapi" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing ytmusicapi for Browse feature...
    pip install ytmusicapi
    echo.
)

echo Starting server with API support...
echo.
echo Open your browser to: http://localhost:8080/index.html
echo.
echo Press Ctrl+C to stop the server
echo ========================================
start "" "http://localhost:8080/index.html"
python server.py

:end
