$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$py      = "C:\Users\杨建威\.workbuddy\binaries\python\versions\3.13.12\python.exe"
$nodeExe = "C:\Users\杨建威\.workbuddy\binaries\node\versions\22.22.2\node.exe"
$env:PATH = (Split-Path $nodeExe) + ";" + $env:PATH
function Port-Open($p){ try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',$p); $c.Close(); return $true } catch { return $false } }
if (-not (Port-Open 8787)) {
    Start-Process -FilePath $py -ArgumentList "run.py" -WorkingDirectory (Join-Path $root "bridge") -WindowStyle Normal
    Start-Sleep -Seconds 2
}
if (-not (Port-Open 5173)) {
    Start-Process -FilePath $nodeExe -ArgumentList "node_modules/vite/bin/vite.js","--port","5173","--host" -WorkingDirectory $root -WindowStyle Normal
    Start-Sleep -Seconds 4
}
Start-Process "http://localhost:5173/"
