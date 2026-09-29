# PowerShell script to restart the backend server
# Run with: .\restart-backend.ps1

Write-Host "🔍 Finding backend process on port 3011..." -ForegroundColor Cyan

# Find process using port 3011
$connection = Get-NetTCPConnection -LocalPort 3011 -ErrorAction SilentlyContinue
if ($connection) {
    $processId = $connection.OwningProcess
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    
    if ($process) {
        Write-Host "⚠️  Found backend process: PID $processId ($($process.ProcessName))" -ForegroundColor Yellow
        Write-Host "🛑 Stopping backend server..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force
        Start-Sleep -Seconds 2
        Write-Host "✅ Backend stopped" -ForegroundColor Green
    }
} else {
    Write-Host "ℹ️  No process found on port 3011" -ForegroundColor Gray
}

# Check if PM2 is being used
$pm2Process = Get-Process -Name "pm2" -ErrorAction SilentlyContinue
if ($pm2Process) {
    Write-Host "🔄 PM2 detected. Restarting with PM2..." -ForegroundColor Cyan
    pm2 restart all
    Write-Host "✅ PM2 restart complete" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Viewing logs (Ctrl+C to exit):" -ForegroundColor Cyan
    pm2 logs --lines 20
} else {
    Write-Host "🚀 Starting backend server..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  Running npm start in this window..." -ForegroundColor Yellow
    Write-Host "    Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host ""
    npm start
}
