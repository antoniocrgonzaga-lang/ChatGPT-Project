@echo off
setlocal
title Neon Star Assault
cd /d "%~dp0"

echo ==========================================
echo    NEON STAR ASSAULT - servidor local
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :python

if not exist "node_modules\vite" (
    echo Instalando dependencias pela primeira vez...
    call npm install
    if errorlevel 1 (
        echo.
        echo Falha no npm install. Tentando servidor Python...
        goto :python
    )
)

echo Iniciando o jogo com Vite. O navegador vai abrir sozinho.
echo Para encerrar, feche esta janela ou pressione Ctrl+C.
echo.
call npm run dev -- --open
goto :end

:python
where python >nul 2>nul
if errorlevel 1 goto :nothing
echo Node.js nao encontrado. Usando servidor Python na porta 8080.
echo Para encerrar, feche esta janela ou pressione Ctrl+C.
echo.
start "" "http://localhost:8080"
python -m http.server 8080
goto :end

:nothing
echo Nenhum servidor disponivel.
echo Instale o Node.js (https://nodejs.org) ou o Python (https://python.org)
echo e execute este arquivo novamente.
echo.
pause

:end
endlocal
