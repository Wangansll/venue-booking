/** 应用装配（不监听端口，便于测试直接调用） */
import express from 'express';
import cors from 'cors';
import config from './config.js';
import { router } from './routes.js';
import { contentRouter } from './routes-content.js';
import { uploadRouter, serveUploads } from './routes-upload.js';
import { venueAdminRouter } from './routes-venues-admin.js';
import { ticketRouter } from './routes-tickets.js';
import { docsHtml } from './docs.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPrometheus, snapshot } from './metrics.js';
import { pool } from './lib.js';
import { requestId, accessLog, securityHeaders, rateLimit, notFound, errorHandler } from './http/middleware.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);

  const allowed = config.cors.origins;
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (!config.isProd) return cb(null, true);
      // 白名单为空 = 单端口同源部署（前端与 API 同一个域名）。
      // 这种部署下 <script crossorigin> 仍会发起 CORS 请求，
      // 若不回 Access-Control-Allow-Origin 会白屏，所以放行。
      if (!allowed.length) return cb(null, true);
      return allowed.includes(origin) ? cb(null, true) : cb(new Error('CORS 不允许该来源'));
    },
    credentials: true,
    maxAge: 86400,
  }));

  // 顺序很重要：先给请求打 ID、记日志、限流，再做 body 解析，
  // 否则非法 JSON 会绕过这三层，直接撞到 500 且日志里查不到。
  app.use(requestId);
  app.use(accessLog);
  app.use('/api', rateLimit);

  app.use(express.json({ limit: '1mb' }));

  // body 解析失败 → 400（不是 500）
  app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({ code: 40000, msg: '请求体不是合法 JSON', requestId: req.id });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ code: 40000, msg: '请求体过大（上限 1MB）', requestId: req.id });
    }
    next(err);
  });

  serveUploads(app, express);

  app.use('/api', router);
  app.use('/api', contentRouter);
  app.use('/api', uploadRouter);
  app.use('/api', venueAdminRouter);
  app.use('/api', ticketRouter);

  // Prometheus 指标
  app.get('/api/metrics', (_req, res) => {
    res.type('text/plain; version=0.0.4').send(toPrometheus());
  });

  // 机器可读的指标快照（压测/告警脚本用）
  app.get('/api/stats', (_req, res) => res.json(snapshot()));

  // 就绪探针：数据库可查 + 迁移已执行才算 ready
  app.get('/api/health/ready', async (_req, res) => {
    try {
      const [r] = await pool.query('SELECT 1 AS ok');
      const [m] = await pool.query('SELECT COUNT(*) AS n FROM schema_migrations');
      const ready = r[0]?.ok === 1 && m[0].n > 0;
      res.status(ready ? 200 : 503).json({ ready, migrations: m[0].n, ts: Date.now() });
    } catch (e) {
      res.status(503).json({ ready: false, error: e.message });
    }
  });

  app.get('/api/docs', (_req, res) => res.type('html').send(docsHtml));
  app.get('/openapi.yaml', (_req, res) => {
    const f = path.resolve(process.cwd(), '../openapi.yaml');
    if (!fs.existsSync(f)) return res.status(404).send('openapi.yaml not found');
    res.type('text/yaml').send(fs.readFileSync(f, 'utf8'));
  });

  // 单端口同时提供前端：有 web/dist 就直接托管，省掉反代与跨域
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // 依次尝试：环境变量 → 镜像内 /app/public（Docker）→ 仓库内 web/dist（本地开发）
  const candidates = [
    process.env.PUBLIC_DIR,
    path.resolve(__dirname, '../public'),
    path.resolve(__dirname, '../../web/dist'),
  ].filter(Boolean);
  const distDir = candidates.find((d) => fs.existsSync(path.join(d, 'index.html'))) || candidates[candidates.length - 1];
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { maxAge: '1h' }));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
