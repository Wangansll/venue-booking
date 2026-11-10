# 体育场官网 · 票务与内容管理系统

一个可运行的全栈站点：**前台 10 栏目 + 后台 6 模块 + 选座购票 + 16 张表 + 40 余接口**，
带接口测试、Docker、CI 与 OpenAPI 文档。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3.5（`<script setup>`）、TypeScript、Vue Router、Pinia、Vite |
| 后端 | Node.js 20、Express 4、mysql2（连接池 + 事务） |
| 数据库 | MySQL 8（生成列、联合唯一索引、行锁） |
| 工程 | Vitest + Supertest、Docker Compose、GitHub Actions、OpenAPI 3 |

## 功能

### 前台
| 路由 | 内容 |
|---|---|
| `/` | 首页：轮播 / 场馆 / 活动 / 新闻 / 亮点 / 数据 / 流程 / 评价 / FAQ |
| `/tickets` `/tickets/:id` | 活动购票 · **选座**（分区座位图、锁座 15 分钟、倒计时） |
| `/my/tickets` | 我的票夹（核销码） |
| `/venues` `/venues/:id` | 场馆列表 · 时段预约（含设施 / 收费 / 使用须知） |
| `/events` `/news` `/article/:id` | 活动 · 新闻 · 详情 |
| `/reviews` | 往届精彩回顾 |
| `/welfare/philosophy` `/welfare/history` | 公益理念 · 公益历程 |
| `/cooperation` | 商务合作（方案 + 咨询） |
| `/disclosure/profile` `/org` `/legal` | 公司信息 · 组织架构 · 法律责任 |
| `/contact` | 联系我们 + 留言 |

### 后台 `/admin`
概览 · 场馆管理（增删改）· 内容管理（草稿/发布、富文本）· 留言 · 预约审核 · **票务核销**

## 核心设计

### 1. 选座：唯一索引就是库存

```sql
seat_locks  UNIQUE KEY uk_seat_session (seat_id, session_id)
```

两人抢同一座，第二条 `INSERT` 直接 `ER_DUP_ENTRY` → 409。锁 15 分钟过期，
下单时校验「锁属于我 + 未过期」，支付成功后释放。

### 2. 金额只由服务端算

```js
// 前端传什么金额都不看，一律按 ticket_tiers 求和
const [priced] = await conn.query(
  `SELECT se.id AS seatId, t.price_cents AS price FROM seats se
     JOIN ticket_tiers t ON t.area_id = se.area_id AND t.session_id = ? ...`);
```

实测：前端传 `amountCents: 1`，服务端仍算出 560 元。

### 3. 支付：provider 抽象

```js
const channel = process.env.PAY_PROVIDER || 'mock'   // mock | wechat
```

- `mock`：直接置 paid 并出票，本地跑通「支付 → 出票 → 核销」
- `wechat`：缺 `WECHAT_MCHID` 时明确返回 503，**不假装成功**

真实接入需要商户号 + API v3 证书 + 备案 HTTPS 域名。

### 4. 场地预约：生成列 + 联合唯一索引

```sql
active TINYINT UNSIGNED
  GENERATED ALWAYS AS (CASE WHEN status IN ('pending','approved') THEN 1 ELSE NULL END) STORED,
UNIQUE KEY uk_slot_active (venue_id, book_date, slot, active)
```

取消后 `active` 变 NULL，同一时段可重新预约。校验与写入同一事务，`SELECT … FOR UPDATE` 锁行。

### 5. 内容模型：新闻与活动共用一张表

`articles.type` 区分，`status` 做 `draft → published` 状态机，前台只查已发布。

### 6. 工程化

| 能力 | 位置 |
|---|---|
| 配置校验 | `config.js`，生产密钥不足 32 位拒绝启动 |
| 结构化日志 + 请求 ID | `logger.js` + `http/middleware.js` |
| 错误码表 | `errors.js`，24 条，5xx 不泄露堆栈 |
| 限流 | 滑动窗口 120 次/分，超限 429 + Retry-After |
| 迁移 | `migrate.js`，checksum 防篡改历史 |
| 优雅关闭 | SIGTERM → 停止接收 → 释放连接池（10s 超时） |
| 测试 | `test/api.test.js`，23 个用例 |
| 部署 | `Dockerfile` × 2 + `docker-compose.yml` + nginx 反代 |

## 快速开始

```bash
# 数据库
mysql -u root -p < db/schema.sql

# 后端
cd server && npm install
cp .env.example .env          # 改 DB_PASS
node src/migrate.js           # 迁移
node src/seed.js              # 账号
node src/seed-tickets.js      # 票务演示数据（3 区 180 座 2 场）
npm run dev                   # http://127.0.0.1:8787/api/health

# 前端
cd web && npm install && npm run dev   # http://localhost:5180
```

**账号**：`student / 123456`　`admin / admin123`
**文档**：`http://127.0.0.1:8787/api/docs`
**Docker**：`docker compose up --build` → `http://localhost:8080`

## 已实测的场景

```
重复预约同一时段        → 409（唯一索引拦的）
取消后重约同一时段      → 200（active 变 NULL）
锁已售座位              → 409（锁座前校验已售）
下单时篡改金额          → 仍按服务端计算
重复支付                → 200 幂等，不重复出票
重复核销                → 409
学生访问管理端          → 403
限流                    → 第 115 次触发 429
```

## 图片

场馆图由图像生成模型批量产出（`tools/gen_venue.py`），**同一段建筑描述 + 8 个场景**，
保证是一栋楼的八个位置；全部本地化，压缩后约 2 MB。

```bash
FORCE=1 PROVIDER_API_KEY=xxx python tools/gen_venue.py lounge tennis
```

## 目录

```
venue-booking/
├── db/migrations/        001_init · 002_audit · 003_content · 004_ticketing
├── server/src/
│   ├── app.js            应用装配（可测试）
│   ├── index.js          启动 + 探活 + 优雅关闭
│   ├── config.js logger.js errors.js validate.js migrate.js
│   ├── routes.js         认证·场馆·预约
│   ├── routes-content.js 内容·留言·概览
│   ├── routes-tickets.js 场次·座位·锁座·订单·支付·核销
│   ├── routes-upload.js  图片上传
│   ├── routes-venues-admin.js
│   └── http/middleware.js
├── web/src/views/        前台 12 个页面 + admin/ 6 个
├── tools/                gen_venue.py 场馆图 / loadtest.mjs 压测
│                        alert-check.mjs 告警 / backup.ps1 / restore.ps1
├── docs/生产验收报告.md   压测 · 可观测 · 备份恢复实测数据
├── reports/              压测 JSON 报告
├── backups/              数据库备份（保留最近 10 份）
└── openapi.yaml
```

## 已知未做

- 微信支付真实下单（等商户号）
- 公众号图文同步（等 AppID / IP 白名单）
- 未来赛事预约提醒、候补排队
- 用户自助注册
