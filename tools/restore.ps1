# 恢复数据库：从指定备份导入，导入后做行数校验
# 凭据从 server/.env 读取，脚本内不出现任何口令
# ⚠ 会 DROP 并重建目标库，只在本地或一次性环境执行
param(
  [Parameter(Mandatory = $true)][string]$File,
  [switch]$Yes             # 必须显式确认，防止手滑
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$MySql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$Path = if ([System.IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $Root $File }

if (-not (Test-Path $Path)) { throw "备份文件不存在: $Path" }
if (-not $Yes) {
  Write-Host "这将 DROP 数据库并重建，所有现有数据会丢失。"
  Write-Host "确认请加 -Yes：  pwsh -File tools/restore.ps1 -File $File -Yes"
  exit 1
}

$EnvFile = Join-Path $Root "server\.env"
if (-not (Test-Path $EnvFile)) { throw "缺少 server/.env" }
$Cfg = @{}
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { $Cfg[$Matches[1]] = $Matches[2] }
}
foreach ($k in @('DB_USER', 'DB_PASS', 'DB_NAME')) {
  if (-not $Cfg.ContainsKey($k)) { throw "server/.env 缺少 $k" }
}

$Cnf = Join-Path $env:TEMP ("my-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + ".cnf")
@"
[client]
user=$($Cfg['DB_USER'])
password=$($Cfg['DB_PASS'])
"@ | Set-Content -LiteralPath $Cnf -Encoding ASCII

Write-Host "从 $(Split-Path -Leaf $Path) 恢复…"
try {
  $Base = '"' + $MySql + '" --defaults-extra-file="' + $Cnf + '" --default-character-set=utf8mb4'
  cmd /c ($Base + ' -e "DROP DATABASE IF EXISTS ' + $Cfg['DB_NAME'] + '; CREATE DATABASE ' + $Cfg['DB_NAME'] + ' DEFAULT CHARACTER SET utf8mb4;" 2>nul')
  cmd /c ($Base + ' ' + $Cfg['DB_NAME'] + ' < "' + $Path + '" 2>nul')
  if ($LASTEXITCODE -ne 0) { throw "导入失败，退出码 $LASTEXITCODE" }

  $q = "SELECT 'users' t, COUNT(*) n FROM users UNION ALL SELECT 'venues', COUNT(*) FROM venues UNION ALL SELECT 'bookings', COUNT(*) FROM bookings UNION ALL SELECT 'articles', COUNT(*) FROM articles UNION ALL SELECT 'seats', COUNT(*) FROM seats;"
  $rows = cmd /c ($Base + ' -D ' + $Cfg['DB_NAME'] + ' -N -e "' + $q.Replace('"','\"') + '" 2>nul')
} finally {
  Remove-Item $Cnf -Force -ErrorAction SilentlyContinue
}

Write-Host "恢复后行数:"
$rows | Where-Object { $_ -match "`t" } | ForEach-Object { $p = $_ -split "`t"; "  {0,-10} {1}" -f $p[0], $p[1] }
$empty = $rows | Where-Object { $_ -match "`t" } | Where-Object { ($_ -split "`t")[1] -eq "0" }
if ($empty) { throw "恢复校验失败：存在空表" }
Write-Host "✓ 恢复完成，所有核心表非空"
