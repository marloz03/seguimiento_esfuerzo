@echo off
echo.
echo  Dashboard TribuDatayAnalitica
echo  ==============================
echo  Iniciando servidor local...
echo.

:: Verificar si Python esta instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Python no esta instalado.
    echo  Descargalo gratis en: https://www.python.org/downloads/
    echo  Marca "Add Python to PATH" al instalar.
    pause
    exit
)

:: Ir a la carpeta donde esta este archivo
cd /d "%~dp0"

:: Abrir Chrome despues de 2 segundos
start "" timeout /t 2 >nul
start "" "http://localhost:8765/dashboard.html"

:: Levantar servidor en puerto 8765
echo  Servidor corriendo en http://localhost:8765
echo  Cierra esta ventana para apagar el dashboard.
echo.
python -m http.server 8765
