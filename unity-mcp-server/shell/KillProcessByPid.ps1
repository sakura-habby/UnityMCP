# Prompt the user to enter a process ID
$processId = Read-Host "Please enter the process ID to kill"

# Check if the input is a valid number
if ($processId -match '^\d+$') {
    # Try to get the process
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

    if ($process) {
        # Kill the process
        Stop-Process -Id $processId -Force
        Write-Host "Process ID $processId has been successfully killed."
    } else {
        Write-Host "No process found with ID $processId."
    }
} else {
    Write-Host "Invalid input. Please enter a valid process ID (numeric)."
}
