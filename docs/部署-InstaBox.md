# 部署到 InstaBox（免费 4C8G，自带 HTTPS，无需域名）

> 平台：<https://instabox.sh>　机器：4 vCPU / 8 GiB / 20 GiB
> 特点：**自带 HTTPS 公网地址**，不需要买域名、不需要备案、不需要配证书。

---

## 一、这个平台能给你什么（已查证）

| 能力 | 说明 |
|---|---|
| **公网端口发布** | `instabox port publish <机器名> 8787` → `https://8787-<机器ID>.域名/`，**默认公开、自带 TLS** |
| 端口数量 | 每台最多 16 个 |
| SSH | `instabox ssh <机器名>`，或用控制台「Connect → SSH tokens」生成一行 `ssh ibssh_…@host` |
| 文件持久化 | 根盘 + `/data` 保留；**暂停/停止不丢文件** |
| 空闲自动暂停 | **闲置 30 分钟自动暂停**，有人访问会自动唤醒（请求会等它起来） |

### 关键结论

- ✅ **不需要 Caddy**（平台已经给了 HTTPS），把 `docker-compose.prod.yml` 里的 `caddy` 段删掉即可
- ✅ **不需要域名/备案**
- ⚠️ **这不是"商用服务器"**：地址是平台域名、会随机器 ID 变化、空闲会暂停 → **适合作品集/面试演示，不适合正式对外运营**
- ⚠️ **20 GiB 磁盘偏紧**，Docker 镜像 + 构建缓存放进去要清缓存

---

## 二、两条路，先探测再选

SSH 进去后先跑这几行（30 秒）：

```bash
uname -m; grep PRETTY /etc/os-release
nproc; free -h | head -2; df -h / | tail -1
sudo -n true && echo "有 sudo" || echo "无 sudo"
which docker node npm mysql 2>&1
```

- **输出里有 `有 sudo`** → 走【方案 A：Docker】
- **没有 sudo** → 走【方案 B：裸机】

---

## 三、方案 A：Docker（推荐，磁盘占用可控）

```bash
# 1) 装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2) 拿代码（用 CLI 从本地推送最省事）
#    在本机执行：instabox push <机器名> ./venue-booking /home/$USER/venue-booking
#    或者在机器里 git clone 你的仓库
cd ~/venue-booking

# 3) 写环境变量
cp .env.example .env
echo "DB_PASS=$(openssl rand -base64 24)"   >> .env   # 手动抄进 .env
echo "JWT_SECRET=$(openssl rand -hex 32)"   >> .env
nano .env      # 填 DB_PASS / JWT_SECRET，DOMAIN 留空不用管

# 4) 只用 mysql + migrate + app（不启 caddy，平台已给 HTTPS）
sudo docker compose -f docker-compose.prod.yml up -d --build mysql migrate app

# 5) 初始化演示数据
sudo docker compose -f docker-compose.prod.yml exec app node src/seed.js
sudo docker compose -f docker-compose.prod.yml exec app node src/seed-tickets.js
sudo docker compose -f docker-compose.prod.yml exec app node src/seed-articles.js

# 6) 发布端口
instabox port publish <机器名> 8787 --name '校园场馆'
```

最后一条会打印形如：

```
https://8787-xxxxxxxx.instabox.sh/
```

**这个地址就是你的公网站点**，自带 https，直接发人。

> 如果 `docker compose` 报缺少 `DOMAIN` 变量：在 `docker-compose.prod.yml` 里把 `caddy` 整段删掉，
> 或改成 `caddy` 只在 `--profile full` 下启动。

---

## 四、方案 B：裸机（没有 sudo 时）

```bash
# Node 20（用 nvm，不需要 sudo）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc && nvm install 20

# MySQL：没有 sudo 装不了，改用平台外部数据库，或问平台是否提供
# 若有 sudo：
sudo apt update && sudo apt install -y mysql-server
sudo mysql -e "CREATE DATABASE venue_booking DEFAULT CHARSET utf8mb4;"

# 项目
cd ~/venue-booking/server
npm ci --omit=dev
cp .env.example .env && nano .env     # DB_HOST=127.0.0.1
node src/migrate.js
node src/seed.js && node src/seed-tickets.js && node src/seed-articles.js

# 构建前端（产物放到后端能读的位置）
cd ../web && npm ci && npm run build
# 后端会从 ../web/dist 读取，无需额外配置

# 起服务（前台先验证）
cd ../server && PORT=8787 HOST=0.0.0.0 node src/index.js
```

验证没问题后用 **systemd** 守护（有 sudo 时）：

```bash
sudo tee /etc/systemd/system/venue.service > /dev/null <<'EOF'
[Unit]
Description=Venue Booking API
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/home/USER/venue-booking/server
ExecStart=/usr/bin/node src/index.js
EnvironmentFile=/home/USER/venue-booking/server/.env
Restart=always
RestartSec=3
User=USER

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now venue
sudo systemctl status venue
```

---

## 五、20 GiB 磁盘怎么省

```bash
# 装完先看占用
docker system df

# 每次重新构建后清理
docker image prune -f && docker builder prune -f

# 如果构建前端时 No space left on device：
docker builder prune -af
rm -rf ~/venue-booking/web/node_modules/.vite
```

> 前端构建峰值约需 1.5 GB 临时空间。空间实在不够时，**在本地构建好 `web/dist`，只把产物推上去**：
> ```bash
> # 本机
> cd web && npm run build
> instabox push <机器名> ./dist /home/USER/venue-booking/web/dist
> ```

---

## 六、上线验收

| # | 检查 | 期望 |
|---|---|---|
| 1 | `https://8787-xxx.instabox.sh/` | 首页正常，地址栏有锁 |
| 2 | `/api/health/ready` | `{"ready":true,"migrations":8}` |
| 3 | 登录 `student / 123456` | 能进 |
| 4 | `/tickets/1` | 座位图 + 二维码显示 |
| 5 | `/admin` | 票房有数字 |
| 6 | 手机打开 | 布局正常 |
| 7 | 闲置 35 分钟后再打开 | **首屏会等十几秒**（机器唤醒），属正常 |

---

## 七、这个平台的边界（务必知道）

| 限制 | 影响 | 应对 |
|---|---|---|
| 地址是平台二级域名 | 不能当正式品牌域名 | 演示够用；正式运营仍需自己的域名 |
| 闲置 30 分钟自动暂停 | 首次访问要等唤醒 | 面试前先点一次预热 |
| 机器 ID 变化 → 地址变 | 链接不稳定 | 别写进简历的"永久链接"，用二维码/短链 |
| 20 GiB 磁盘 | 不能存大量图片 | 上传目录定期清理，或换对象存储 |
| 无备案、平台域名 | 不能用于真实收费业务 | 与前面评审结论一致：演示级 |

---

## 八、一句话

**InstaBox 是"免费、自带 HTTPS、不用备案"的演示环境，够你把项目挂到公网上发给人看；
但它不是"商用服务器"，正式对外仍需自己的域名 + 备案 + 商户资质。**
