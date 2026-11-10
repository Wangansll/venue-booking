# 备份数据库：结构 + 数据，带时间戳，保留最近 10 份
# 凭据从 server/.env 读取，脚本内不出现任何口令
param([int]$Keep = 10)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$MySql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
$Dir = Join-Path $Root "backups"

# ── 读取凭据 ──
$EnvFile = Join-Path $Root "server\.env"
if (-not (Test-Path $EnvFile)) { throw "缺少 server/.env，先复制 server/.env.example 并填写" }
$Cfg = @{}
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { $Cfg[$Matches[1]] = $Matches[2] }
}
foreach ($k in @('DB_USER', 'DB_PASS', 'DB_NAME')) {
  if (-not $Cfg.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($Cfg[$k])) { throw "server/.env 缺少 $k" }
}

# ── 临时 cnf：口令不出现在命令行 ──
$Cnf = Join-Path $env:TEMP ("my-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".cnf")
@"
[client]
user=$($Cfg['DB_USER'])
password=$($Cfg['DB_PASS'])
"@ | Set-Content -LiteralPath $Cnf -Encoding ASCII

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$File = Join-Path $Dir "venue_booking-$Stamp.sql"

try {
  $Cmd = '"' + $MySql + '" --defaults-extra-file="' + $Cnf + '" --single-transaction --quick --routines --triggers --default-character-set=utf8mb4 ' + $Cfg['DB_NAME'] + ' > "' + $File + '" 2>nul'
  cmd /c $Cmd
  if ($LASTEXITCODE -ne 0) { throw "mysqldump 退出码 $LASTEXITCODE" }
} finally {
  Remove-Item $Cnf -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $File)) { throw "备份失败：未生成文件" }
$Size = (Get-Item $File).Length
if ($Size -lt 1024) { throw "备份异常：文件过小 ($Size B)" }

$Text = Get-Content $File -Raw
$Tables = @("users", "venues", "bookings", "articles") | Where-Object { $Text -match "CREATE TABLE ``$_``" }
if ($Tables.Count -lt 4) { throw "备份校验失败：核心表缺失 ($($Tables -join ','))" }

Write-Host ("✓ 备份完成 {0}  ({1:N0} KB)  表: {2}" -f (Split-Path -Leaf $File), ($Size / 1KB), ($Tables -join ', '))

$Old = Get-ChildItem $Dir -Filter "venue_booking-*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
foreach ($f in $Old) { Remove-Item $f.FullName -Force; Write-Host "  删除旧备份 $($f.Name)" }
