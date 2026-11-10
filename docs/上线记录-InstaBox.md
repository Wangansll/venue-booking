# 上线记录（InstaBox 实测）

> 部署时间：2026-11-10　目标：拿到一个可以发人的公网地址

## 线上地址

```
https://8787-agq4luqs3lmb4ztppny2xoscmm.instabox.tech
```

> ⚠️ 地址随机器 ID 生成；停掉机器或重新发布端口可能变化。

## 服务器实际情况（和购买页写的不完全一样）

| 项 | 购买页 | 实际 |
|---|---|---|
| 系统 | — | **Debian GNU/Linux 13 (trixie)** |
| CPU | 4 vCPU | 4（x86_64） |
| 内存 | 8 GiB | 7.8 Gi（可用 7.3 Gi） |
| 磁盘 | 20 GiB | **根盘 16 Gi（可用 11 Gi）+ `/data` 20 Gi（可用 16 Gi）** |
| Node | — | **已装 v22.23.3**（无需安装） |
| 数据库 | — | **无 MySQL，仓库只有 MariaDB 11.8** |
| systemd | — | 是 PID 1，可用 |

## 实际采用的方案（与文档不同之处）

| 决策 | 原因 |
|---|---|
| **不用 Docker** | 根盘只有 11 Gi，镜像+构建缓存要吃 3–5 Gi |
| **用 MariaDB 11.8 而非 MySQL 8** | Debian 13 仓库不提供 MySQL 8；本项目 SQL 无 MySQL 8 专属语法（已核对：无 `utf8mb4_0900` 排序规则、生成列用标准 `GENERATED ... STORED`） |
| **不用 Caddy** | 平台自带 HTTPS（`instabox-port publish`） |
| 代码放 `/data/home/` | 根盘紧张，`/data` 有 16 Gi 可用 |
| systemd 守护 | `venue.service`，`Restart=always` |

## 部署步骤（可复现）

```bash
# 1. 装数据库
sudo apt-get install -y mariadb-server
sudo systemctl enable --now mariadb

# 2. 建库建号
sudo mariadb -e "CREATE DATABASE venue_booking DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
sudo mariadb -e "CREATE USER 'venue'@'localhost' IDENTIFIED BY '<随机>';"
sudo mariadb -e "GRANT ALL PRIVILEGES ON venue_booking.* TO 'venue'@'localhost'; FLUSH PRIVILEGES;"

# 3. 上传代码到 /data/home/venue-booking，写 .env（600 权限）

# 4. 后端
cd server && npm ci --omit=dev && node src/migrate.js

# 5. 前端
cd ../web && npm ci && npm run build     # 产物 dist/，后端自动托管

# 6. 内容数据（从本地导出）
mysqldump --no-create-info --complete-insert venue_booking venues banners articles > content.sql
mariadb -u venue -p venue_booking < content.sql

# 7. 守护
sudo tee /etc/systemd/system/venue.service ...   # 见下
sudo systemctl enable --now venue

# 8. 发布端口
instabox-port publish 8787 --name venue
```

## 部署中发现并修复的 3 个真问题

### 1. schema 漂移：`venues.cover` 不在迁移脚本里

本地库有 `cover` 列，但 `db/migrations/` 里没有对应语句——**这一列是早期手动加的**。
后果：任何全新环境导入场馆数据都会 `ERROR 1054 Unknown column 'cover'`。

修法：新增 `db/migrations/008_venue_cover.sql`，用 `information_schema` 守卫，已有该列的环境自动跳过。

> 这正是「照文档部署跑不起来」的典型原因——只在有历史数据的机器上能跑。

### 2. 白屏：`<script crossorigin>` 触发 CORS，而白名单为空

Vite 产物的 `<script type="module" crossorigin>` 会**强制以 CORS 模式**加载，即使是同源。
生产环境 `CORS_ORIGINS` 为空时，`cors()` 不返回 `Access-Control-Allow-Origin` → **脚本被拦，页面全白**。

修法（`server/src/app.js`）：白名单为空时视为「单端口同源部署」，直接放行。

```js
if (!allowed.length) return cb(null, true);
```

### 3. 服务只监听 `127.0.0.1`

`app.listen(port)` 默认绑 loopback，云平台的端口发布访问不到 → 502。
修法：新增 `HOST` 配置，默认 `0.0.0.0`。

## 线上验收（实测）

| 检查 | 结果 |
|---|---|
| `GET /api/health/ready` | 200 `{"ready":true,"migrations":8}` |
| `GET /api/sessions` | 200 JSON 459 B |
| `GET /` | 200 HTML 956 B |
| `GET /news`（SPA 路由） | 200 |
| 主 JS `/assets/index-*.js` | 200 115.8 KB |
| 场馆图 `/img/venue/court.jpg` | 200 259 KB |
| `POST /api/auth/login`（student） | 200 code=0 |
| `GET /api/tickets/mine` | 200 票数 0 |
| `GET /api/home` | 场馆 4 / 新闻 3 / 统计 4 项 |
| 浏览器渲染 | 完整（轮播、场馆卡、图片全部正常） |

## 这个环境的限制（必须知道）

| 限制 | 影响 |
|---|---|
| **闲置 30 分钟自动暂停** | 首次访问要等唤醒（数秒到十几秒） |
| 地址含机器 ID | 不适合写进简历当"永久链接" |
| 无自有域名 | 不能用于正式对外品牌 |
| 根盘仅剩 ~11 Gi | 上传图片多了要清理，或换对象存储 |
| 无备案 | 不能用于真实收费业务 |

**结论：这是"演示级上线"，不是"商用上线"。** 与之前的评审结论一致。

## 常用运维命令

```bash
# 状态与日志
systemctl status venue
journalctl -u venue -n 50 --no-pager

# 重启
sudo systemctl restart venue

# 更新代码后
cd web && npm run build && sudo systemctl restart venue

# 备份
mysqldump -u venue -p venue_booking | gzip > ~/backup-$(date +%F).sql.gz
```
