#!/usr/bin/env bash
# InstaBox 一键部署（Ubuntu 22.04 / x86_64）
# 用法：bash deploy-instabox.sh
# 幂等：可重复执行；已安装的步骤会跳过
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { printf "\n${GREEN}==> %s${NC}\n" "$1"; }
warn() { printf "${YELLOW}[!] %s${NC}\n" "$1"; }
die()  { printf "${RED}[x] %s${NC}\n" "$1"; exit 1; }

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

# ───────── 0. 环境探测 ─────────
step "0/7 环境探测"
echo "  架构: $(uname -m)"
echo "  内存: $(free -h | awk '/^Mem:/{print $2}')"
echo "  磁盘: $(df -h / | awk 'NR==2{print $4}') 可用"

SUDO=""
if sudo -n true 2>/dev/null; then
  SUDO="sudo"; echo "  sudo: 可用"
else
  echo "  sudo: 不可用（将跳过 apt 安装）"
fi

# ───────── 1. Node 20（用 nvm，不需要 sudo）─────────
step "1/7 Node 20"
if command -v node >/dev/null 2>&1 && [ "$(node -v | cut -d. -f1 | tr -d v)" -ge 20 ]; then
  echo "  已有 $(node -v)，跳过"
else
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 20 >/dev/null
  nvm use 20 >/dev/null
  echo "  已安装 $(node -v)"
fi

# ───────── 2. MySQL 8 ─────────
step "2/7 MySQL"
if command -v mysql >/dev/null 2>&1; then
  echo "  已安装 $(mysql --version | awk '{print $3}')"
elif [ -n "$SUDO" ]; then
  $SUDO apt-get update -qq
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq mysql-server
  $SUDO systemctl enable --now mysql
  echo "  已安装 MySQL"
else
  die "没有 sudo 且未安装 MySQL。请先在平台侧开启 sudo，或改用外部数据库。"
fi

# ───────── 3. 数据库与账号 ─────────
step "3/7 建库"
DB_NAME="venue_booking"
DB_USER="venue"
DB_PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 24)"
if [ -f "$APP_DIR/.env" ]; then
  # 复用已有口令，避免重跑时改库密码
  EXIST_PASS="$(grep -E '^DB_PASS=' "$APP_DIR/.env" | head -1 | cut -d= -f2- || true)"
  [ -n "${EXIST_PASS:-}" ] && DB_PASS="$EXIST_PASS"
  echo "  发现已有 .env，沿用其中的数据库口令"
fi

$SUDO mysql <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "  库 ${DB_NAME}、用户 ${DB_USER} 就绪"

# ───────── 4. .env ─────────
step "4/7 生成 .env"
if [ -f "$APP_DIR/.env" ]; then
  echo "  .env 已存在，跳过（如需重配请先备份后删除）"
else
  JWT_SECRET="$(openssl rand -hex 32)"
  cat > "$APP_DIR/.env" <<ENV
PORT=8787
HOST=0.0.0.0
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
DB_NAME=${DB_NAME}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES=7d
CORS_ORIGINS=
RL_MAX=300
RL_WINDOW_MS=60000
PAY_PROVIDER=mock
NOTIFY_PROVIDER=console
NODE_ENV=production
ENV
  chmod 600 "$APP_DIR/.env"
  echo "  已生成（口令随机，权限 600）"
fi

# ───────── 5. 依赖与构建 ─────────
step "5/7 安装依赖并构建前端"
if [ ! -d "$APP_DIR/server/node_modules" ]; then
  ( cd "$APP_DIR/server" && npm ci --omit=dev --no-audit --no-fund )
else
  echo "  后端依赖已存在"
fi
if [ ! -f "$APP_DIR/web/dist/index.html" ]; then
  ( cd "$APP_DIR/web" && npm ci --no-audit --no-fund && npm run build )
  echo "  前端已构建"
else
  echo "  前端产物已存在"
fi

# ───────── 6. 迁移 + 种子 ─────────
step "6/7 数据库迁移"
( cd "$APP_DIR/server" && set -a && . "$APP_DIR/.env" && set +a && node src/migrate.js )

if [ "${SEED:-0}" = "1" ]; then
  ( cd "$APP_DIR/server" && set -a && . "$APP_DIR/.env" && set +a && \
    node src/seed.js && node src/seed-tickets.js && node src/seed-articles.js )
  echo "  演示数据已写入（student/123456、admin/admin123）"
else
  echo "  跳过演示数据（需要时加 SEED=1 重跑）"
fi

# ───────── 7. 守护进程 ─────────
step "7/7 启动服务"
if [ -n "$SUDO" ] && command -v systemctl >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
  $SUDO tee /etc/systemd/system/venue.service >/dev/null <<UNIT
[Unit]
Description=Venue Booking
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/server
ExecStart=${NODE_BIN} src/index.js
EnvironmentFile=${APP_DIR}/.env
Restart=always
RestartSec=3
User=${USER}

[Install]
WantedBy=multi-user.target
UNIT
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now venue
  sleep 3
  $SUDO systemctl is-active venue >/dev/null && echo "  systemd 已启动 venue 服务" || {
    $SUDO journalctl -u venue -n 20 --no-pager; die "服务启动失败"; }
else
  pkill -f "node src/index.js" 2>/dev/null || true
  ( cd "$APP_DIR/server" && set -a && . "$APP_DIR/.env" && set +a && \
    nohup node src/index.js > "$APP_DIR/server.log" 2>&1 & )
  sleep 3
  echo "  已用 nohup 启动（日志 server.log）"
fi

# ───────── 自检 ─────────
step "自检"
for i in $(seq 1 10); do
  if curl -fsS --max-time 3 http://127.0.0.1:8787/api/health/ready >/dev/null 2>&1; then
    echo "  就绪探针: OK"
    curl -s http://127.0.0.1:8787/api/health/ready; echo
    break
  fi
  sleep 2
done
curl -s -o /dev/null -w "  首页 HTTP %{http_code}\n" http://127.0.0.1:8787/ || true

cat <<'TIP'

────────────────────────────────────────
下一步：发布端口，拿到公网 HTTPS 地址

  instabox port publish <机器名> 8787 --name '校园场馆'

（在网页终端里可直接用：instabox-port publish 8787）
────────────────────────────────────────
TIP
