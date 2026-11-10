/** HTTP 中间件：请求 ID / 访问日志 / 安全头 / 限流 / 错误处理 */
import crypto from 'node:crypto';
import config from '../config.js';
import { logger, childLogger } from '../logger.js';
import { AppError, codeInfo } from '../errors.js';
import { recordRequest, toPrometheus, snapshot } from '../metrics.js';

/** 每个请求一个 ID，贯穿日志 */
export function requestId(req, res, next) {
  const rid = req.headers['x-request-id'] || crypto.randomUUID().slice(0, 8);
  req.id = rid;
  req.log = childLogger(rid);
  res.setHeader('X-Request-Id', rid);
  next();
}

/** 访问日志：记录耗时，超阈值标 slow */
export function accessLog(req, res, next) {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    recordRequest(req.method, req.originalUrl, res.statusCode, ms);
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`;
    const extra = { method: req.method, path: req.originalUrl, status: res.statusCode, ms: Math.round(ms), reqId: req.id };
    if (ms > config.slowMs) logger.warn('slow', { ...extra, slow: true });
    else if (res.statusCode >= 500) logger.error(line, extra);
    else if (res.statusCode >= 400) logger.warn(line, extra);
    else logger.info(line, extra);
  });
  next();
}

/** 安全响应头（不引 helmet，手写等价子集） */
export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/** 内存滑动窗口限流：单机够用，多实例换 Redis */
const buckets = new Map();
export function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const { windowMs, max } = config.rateLimit;

  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) { b = { start: now, count: 0 }; buckets.set(key, b); }
  b.count += 1;

  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)));

  if (b.count > max) {
    res.setHeader('Retry-After', String(Math.ceil((windowMs - (now - b.start)) / 1000)));
    return next(new AppError(42900));
  }
  next();
}

// 定期清理过期桶，避免内存增长
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.start > config.rateLimit.windowMs * 2) buckets.delete(k);
}, 60_000);
sweep.unref();

/** 404 */
export function notFound(req, res, next) {
  next(new AppError(40400, `接口不存在: ${req.method} ${req.path}`));
}

/** 统一错误处理：5xx 不泄露内部细节 */
export function errorHandler(err, req, res, _next) {
  const isApp = err instanceof AppError;
  const code = isApp ? err.code : 50000;
  const info = codeInfo(code);
  const status = isApp ? err.http : 500;

  if (status >= 500) {
    logger.error('unhandled', { reqId: req.id, err: err.message, stack: err.stack?.split('\n').slice(0, 4) });
  }

  const body = {
    code,
    msg: isApp && err.expose ? err.message : info.msg,
    requestId: req.id,
  };
  if (isApp && err.expose && err.extra) body.detail = err.extra;

  res.status(status).json(body);
}
