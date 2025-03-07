# 设置端口号
$port = 28080

# 获取所有使用指定端口的进程 ID
$pids = netstat -ano | findstr ":$port" | ForEach-Object {
    $_.Split()[-1]  # 提取 PID
} | Sort-Object -Unique

# 如果没有找到相关进程，退出
if ($pids.Count -eq 0) {
    Write-Host "do not find any process using port: $port"
    exit
}

# 遍历每个进程 ID
foreach ($processId in $pids) {
    # 获取进程详细信息
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        $wmiProcess = Get-WmiObject Win32_Process -Filter "ProcessId = $processId"
        # 输出进程信息
        Write-Host "----------------------------------"
        Write-Host "Id: $($process.Id)"
        Write-Host "CommandLine: $($wmiProcess.CommandLine)"
        Write-Host "ProcessName: $($process.ProcessName)"
        Write-Host "Path: $($process.Path)"
        Write-Host "MainWindowTitle: $($process.MainWindowTitle)"
        Write-Host "StartTime: $($process.StartTime)"
        Write-Host "Handles: $($process.Handles)"
        Write-Host "SessionId: $($process.SessionId)"
        Write-Host "PriorityClass: $($process.PriorityClass)"
        Write-Host "----------------------------------"
    }
}

# 按回车键退出
Read-Host "Press Enter to exit..."
