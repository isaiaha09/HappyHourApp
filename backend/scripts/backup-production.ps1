param(
    [string]$OutputDir = (Join-Path $HOME 'DiningDealzBackups'),
    [string]$DatabaseUrlEnv = 'BACKUP_DATABASE_URL'
)

$ErrorActionPreference = 'Stop'

$backendDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonPath = Join-Path $backendDir 'venv\Scripts\python.exe'
$managePath = Join-Path $backendDir 'manage.py'

if (-not (Test-Path $pythonPath)) {
    throw "Backend virtual environment was not found at $pythonPath. Create it or update this script's Python path."
}

if (-not [Environment]::GetEnvironmentVariable($DatabaseUrlEnv)) {
    throw "Set $DatabaseUrlEnv to the Render external PostgreSQL URL before running this script."
}

& $pythonPath $managePath backup_production_data --output-dir $OutputDir --database-url-env $DatabaseUrlEnv
if ($LASTEXITCODE -ne 0) {
    throw "Production backup failed with exit code $LASTEXITCODE."
}