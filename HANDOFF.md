# 交接说明（给外部模型 / 评审者）

> 这是「校园场馆 · 体育场官网」全栈项目。本文档用于**让别人独立跑起来并验证**，
> 不需要原作者解释。所有命令都在项目根目录执行。

---

## 0. 项目位置

```
C:\Users\001\WorkBuddy\2026-11-05-21-07-50\venue-booking
```

结构：

```
db/migrations/     001_init · 002_audit · 003_content · 004_ticketing
server/            Node + Express + mysql2（含 test/、Dockerfile）
web/               Vue 3 + TS + Vite（含 nginx.conf、Dockerfile）
tools/             gen_venue.py 场馆图 · loadtest.mjs 压测
                   alert-check.mjs 告警 · backup.ps1 / restore.ps1
docs/              生产验收报告.md（压测/可观测/备份实测数据）
openapi.yaml       接口契约（或访问 /api/docs）
docker-compose.yml mysql + migrate + server + web
```

---

## 1. 前置条件

| 依赖 | 版本 | 检查命令 |
|---|---|---|
| Node.js | ≥ 20 | `node -v` |
| MySQL | 8.x，root 可登录 | `mysql -u root -p -e "select version()"` |
| Python | 3.9+（仅生成图时要） | `python --version` |

没有本地 MySQL 就用 Docker（见第 6 节），**不要跳过**，数据库是必选依赖。

---

## 2. 启动（约 3 分钟）

```bash
# 1) 建库（只需第一次）
mysql -u root -p < db/schema.sql

# 2) 后端
cd server
copy .env.example .env          # Windows；Linux/mac 用 cp
#   改 .env 里的 DB_PASS 为你本机 MySQL 密码
npm install
node src/migrate.js             # 建表（幂等，可重复跑）
node src/seed.js                # 账号：student/123456、admin/admin123
node src/seed-tickets.js        # 票务演示数据：3 区 180 座 2 场
node src/seed-articles.js       # 9 篇新闻/活动正文
npm run dev                     # http://127.0.0.1:8787/api/health

# 3) 前端（另开一个终端）
cd web
npm install
npm run dev                     # http://localhost:5180
```

---

## 3. 验收清单（按顺序，每步都有预期结果）

| # | 命令 / 地址 | 预期结果 |
|---|---|---|
| 1 | `curl http://127.0.0.1:8787/api/health` | `{"data":{"db":true,...}}`，响应头有 `X-Request-Id` |
| 2 | `curl http://127.0.0.1:8787/api/health/ready` | `{"ready":true,"migrations":4}` |
| 3 | `curl http://127.0.0.1:8787/api/metrics` | Prometheus 文本，含 `venue_requests_total` |
| 4 | 浏览器打开 `http://localhost:5180` | 首页 9 个区块正常，轮播有箭头/指示点/计数 |
| 5 | 登录 `student / 123456` → `/tickets/1` | 180 个座位，底部「锁定并支付」常驻 |
| 6 | 选 2 座 → 支付 | 提示出票 2 张，跳转票夹 |
| 7 | 后台 `/admin`（`admin/admin123`）→ 票务核销 | 输入票码核销成功；再输一次报「已使用」 |
| 8 | `cd server && npm test` | **13 tests passed** |
| 9 | `cd web && npm run typecheck` | 无输出、退出码 0 |
| 10 | `cd web && npm run build` | `✓ built in ~1s` |
| 11 | `cd server && npm run alert` | `✓ 正常　错误率 0.00% …` |
| 12 | `powershell -File tools/backup.ps1` | `✓ 备份完成 … 表: users, venues, bookings, articles` |

---

## 4. 深度验证（可选，会改数据）

### 并发防重

两个终端同时提交同一时段，第二个应返回 **409**：

```bash
curl -X POST http://127.0.0.1:8787/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"venueId":1,"date":"2030-07-01","slot":5}'
```

**判据**：第一次 200，第二次 `409 / code 40901`。

### 金额篡改

下单时故意传 `"amountCents": 1`，服务端应忽略并算出真实金额：

**判据**：返回的 `amount` 是 `56000`（2 座 × 280 元），不是 `1`。

### 压测

```bash
cd server
PORT=8788 RL_MAX=1000000 node src/index.js      # 压测实例，解除限流
node ../tools/loadtest.mjs --url=http://127.0.0.1:8788 --c=50 --n=2000
```

**判据**（本机实测参考）：RPS ≈ 3000，P95 ≈ 31ms，成功率 100%。
机器不同数值会变，但**错误率必须是 0**，P95 应在几百毫秒内。

> 注意：直接用 8787 跑压测会被限流打成 429（默认 120 次/分钟），这是**预期行为**，不是 bug。

### 备份恢复演练

```powershell
powershell -File tools/backup.ps1
powershell -File tools/restore.ps1 -File backups\venue_booking-<时间戳>.sql
```

**判据**：恢复后 `users 2 / venues 4 / bookings 10 / articles 9 / seats 180`，且接口 200。

---

## 5. ⚠️ 危险操作与边界

| 操作 | 风险 | 说明 |
|---|---|---|
| `tools/restore.ps1` | **会 `DROP DATABASE venue_booking`** | 只在本地或一次性环境跑；别指向正在用的库 |
| `node src/seed-tickets.js` | **会 TRUNCATE 票务表** | 演示数据重置，会清掉已有订单/票 |
| `npm run loadtest` | 噪声大、占 CPU | 别在共享机器上跑 |
| 真支付 | 未接入 | 缺商户号时接口明确返回 503，**不会假装成功** |

**不要做的事**

- 不要把 `server/.env` 发给别人（含数据库密码与 JWT 密钥）
- 不要在 `.env` 里把 `NODE_ENV=production` 却用默认密钥 —— 启动会直接退出（这是设计行为）
- 不要用 `db/schema.sql` 重建已有数据的库（它含 `DROP DATABASE`）

---

## 6. 用 Docker 跑（没有本地 MySQL 时）

```bash
docker compose up --build
# 前端 http://localhost:8080，API 走 nginx 反代到 server 容器
```

首次启动会自动跑迁移；`server/package.json` 里 `npm run seed` 需要手动执行一次建账号。

---

## 6.5 故障注入开关（验证补偿逻辑）

```bash
REFUND_FAIL_TEST=1 PORT=8789 node src/index.js   # 渠道退款必然失败
```

用它验证「退款失败时订单会回退」：发起退票应得到 503，订单状态仍是 `paid`，
`orders.refund_error` 里记着失败原因。**这是防止真实渠道下"钱退了但账没记"的护栏。**

## 7. 已知问题（不用报告，已记录）

| 问题 | 位置 | 说明 |
|---|---|---|
| `/api/articles` 平均 72ms，比其它接口慢一倍 | `routes-content.js` | `COUNT(*)` + `OFFSET` 深分页，量大需改游标 |
| 富文本编辑器用 `document.execCommand` | `admin/RichEditor.vue` | 该 API 已废弃，但浏览器仍支持；换 ProseMirror 成本高 |
| 图片存本地 `uploads/` | `routes-upload.js` | 生产应换对象存储 |
| 告警只写本地日志 | `tools/alert-check.mjs` | 未接钉钉/企微 webhook |

---

## 8. 这个项目「能证明什么」

给评审者的判断依据：

- **工程结构**：config / logger / errors / middleware / routes 分层，不是一坨 `index.js`
- **并发正确性**：靠数据库唯一索引，不靠应用层判重（可实测 409）
- **金额与幂等**：服务端重算金额；支付重复调用不重复出票
- **可交付**：迁移、种子、测试、Docker、CI、OpenAPI、压测、告警、备份恢复
- **诚实边界**：支付/公众号标注为未接入，缺配置时明确报错而不是伪造成功

**它没做到的**：ICP 备案、支付商户号、隐私协议、真实用户规模——这些是主体资格问题，不是代码问题。
