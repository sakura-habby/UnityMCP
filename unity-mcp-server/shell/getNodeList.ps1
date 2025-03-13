$process = Get-Process -Name node
$process | ForEach-Object {
    Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" | Select-Object Name, ProcessId, CommandLine
}
