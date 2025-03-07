# Requires administrator privileges
#Requires -RunAsAdministrator

$port = Read-Host 'Enter port to kill'

# Get TCP and UDP connections
$tcpProcess = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | 
    Where-Object { $_.State -eq 'Listen' } | 
    ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue }

$udpProcess = Get-NetUDPEndpoint -LocalPort $port -ErrorAction SilentlyContinue | 
    ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue }

$processes = @($tcpProcess) + @($udpProcess) | Select-Object -Unique

if ($processes) {
    $processes | ForEach-Object {
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        Write-Host "Terminating process: $($_.Name) (PID: $($_.Id)) [CMD: $cmdLine]"
        Stop-Process -Id $_.Id -Force
    }
    Write-Host "Port $port released" -ForegroundColor Green
} else {
    Write-Host "No process found using port $port" -ForegroundColor Yellow
}
