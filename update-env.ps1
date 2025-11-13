# PowerShell script to update .env file with MongoDB connection string
# Usage: .\update-env.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Update MongoDB Connection String" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "To fix the authentication error, you need to:" -ForegroundColor Yellow
Write-Host "1. Go to https://cloud.mongodb.com/" -ForegroundColor White
Write-Host "2. Click 'Connect' on your cluster" -ForegroundColor White
Write-Host "3. Select 'Connect your application'" -ForegroundColor White
Write-Host "4. Copy the connection string" -ForegroundColor White
Write-Host "5. Replace <username> and <password> with your actual credentials" -ForegroundColor White
Write-Host ""

$connectionString = Read-Host "Paste your MongoDB connection string here (with username/password replaced)"

if ([string]::IsNullOrWhiteSpace($connectionString)) {
    Write-Host "No connection string provided. Exiting." -ForegroundColor Red
    exit 1
}

# Remove any quotes if user pasted them
$connectionString = $connectionString.Trim('"').Trim("'")

# Validate format
if (-not $connectionString -match "^mongodb\+srv://") {
    Write-Host "Warning: Connection string doesn't start with 'mongodb+srv://'" -ForegroundColor Yellow
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Read current PORT from .env if it exists
$port = "3001"
if (Test-Path .env) {
    $currentEnv = Get-Content .env -Encoding UTF8
    foreach ($line in $currentEnv) {
        if ($line -match "^PORT=(.+)$") {
            $port = $matches[1].Trim()
            break
        }
    }
}

# Create new .env content
$envContent = @"
MONGODB_URI=$connectionString
PORT=$port
"@

# Backup existing .env if it exists
if (Test-Path .env) {
    $backupName = ".env.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item .env $backupName
    Write-Host "Backed up existing .env to $backupName" -ForegroundColor Green
}

# Write new .env file
try {
    [System.IO.File]::WriteAllText((Resolve-Path .).Path + "\.env", $envContent, [System.Text.Encoding]::UTF8)
    Write-Host ""
    Write-Host "✅ .env file updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart your server: .\stop-server.bat then .\start-server.bat" -ForegroundColor White
    Write-Host "2. Check connection: http://localhost:3001/health" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "❌ Error writing .env file: $_" -ForegroundColor Red
    exit 1
}

