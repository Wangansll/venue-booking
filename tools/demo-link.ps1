# 临时公网演示：拉起服务 + SSH 隧道，打印可发人的地址
# 用法：
#   pwsh -File tools/demo-link.ps1            # 默认 serveo（免费，首次访问有确认页）
#   pwsh -File tools/demo-link.ps1 -Provider pinggy
#
# 注意：关掉窗口 / 断网即失效；正式对外请用 docs/部署上线指南.md

param(
  [ValidateSet('serveo', 'pinggy')]
  [string]$Provider = 'serveo',
  [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Ssh = 'C:\WINDOWS\System32\OpenSSH\ssh.exe'

# ── 1. 确保后端在跑（单端口提供前端 + 接口）──
$listening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Host "启动后端（$Port）…"
  $dist = Join-Path $Root 'web\dist\index.html'
  if (-not (Test-Path $dist)) {
    Write-Host "前端未构建，先执行 npm run build…"
    Push-Location (Join-Path $Root 'web')
    npm run build | Out-Null
    Pop-Location
  }
  Start-Process -FilePath 'node' -ArgumentList 'src/index.js' -WorkingDirectory (Join-Path $Root 'server') -WindowStyle Hidden
  Start-Sleep -Seconds 4
}

try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 6
  if ($h.StatusCode -ne 200) { throw "健康检查返回 $($h.StatusCode)" }
  Write-Host "✓ 后端就绪 http://127.0.0.1:$Port"
} catch {
  throw "后端未就绪：$($_.Exception.Message)"
}

# ── 2. 清掉旧的隧道进程 ──
Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'serveo|pinggy' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# ── 3. 起隧道，从输出里抓公网地址 ──
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $Ssh
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.EnvironmentVariables['TERM'] = 'dumb'

if ($Provider -eq 'serveo') {
  $psi.Arguments = "-T -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=20 -R 80:localhost:$Port serveo.net"
} else {
  $psi.Arguments = "-T -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=20 -p 443 -R0:localhost:$Port a.pinggy.io"
}

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$null = $proc.Start()
Write-Host "等待隧道分配地址…"

$url = $null
$deadline = (Get-Date).AddSeconds(45)
while (-not $url -and (Get-Date) -lt $deadline -and -not $proc.HasExited) {
  Start-Sleep -Milliseconds 800
  $chunk = $proc.StandardOutput.ReadLine()
  if ($chunk) {
    $m = [regex]::Match($chunk, 'https://[a-z0-9-]+\.(serveousercontent\.com|pinggy-free\.link|free\.pinggy\.net)')
    if ($m.Success) { $url = $m.Value }
  }
}

if (-not $url) {
  Write-Host "`n未能自动拿到地址。请查看隧道输出："
  Write-Host $proc.StandardOutput.ReadToEnd()
  exit 1
}

# ── 4. 验证一遍接口，避免给出去的是坏链 ──
try {
  $r = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 20 -Headers @{ 'User-Agent' = 'Mozilla/5.0' }
  $ok = $r.Content.StartsWith('{"code"')
} catch { $ok = $false }

Write-Host ""
Write-Host "  公网地址: $url" -ForegroundColor Green
Write-Host "  接口自检: $(if ($ok) { '正常（返回 JSON）' } else { '异常，需排查' })"
Write-Host ""
Write-Host "  提示："
Write-Host "   - 首次打开可能有一个确认页，点一下即可进入"
Write-Host "   - 关闭本窗口即断开；地址每次重启会变"
Write-Host "   - 正式对外部署见 docs/部署上线指南.md"
Write-Host ""
Write-Host "按 Ctrl+C 停止隧道"

$proc.WaitForExit()
