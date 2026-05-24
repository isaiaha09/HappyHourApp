$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

if (Test-Path Env:CI) {
    Remove-Item Env:CI -ErrorAction SilentlyContinue
}

if (Test-Path '.\venv\Scripts\python.exe') {
    & '.\venv\Scripts\python.exe' manage.py runserver 0.0.0.0:8000
} else {
    python manage.py runserver 0.0.0.0:8000
}