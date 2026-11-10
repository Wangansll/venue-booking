import config from './config.js';
import { logger } from './logger.js';
import { pool } from './lib.js';
import { createApp } from './app.js';
import { startScheduler } from './scheduler.js';

const app = createApp();

// 启动前先探数据库，连不上直接退出，不带病上线
try {
  const [rows] = await pool.query('SELECT 1 AS ok');
  if (rows[0]?.ok !== 1) throw new Error('数据库探活失败');
  logger.info('数据库连接正常', { db: config.db.database, env: config.env });
} catch (e) {
  logger.fatal('数据库连接失败，进程退出', { err: e.message });
  process.exit(1);
}

startScheduler();

const server = app.listen(config.port, config.appHost, () => {
  logger.info(`API 已启动 http://127.0.0.1:${config.port}/api/health`, { env: config.env, port: config.port });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn(`收到 ${signal}，开始优雅关闭`);

  const force = setTimeout(() => { logger.fatal('关闭超时，强制退出'); process.exit(1); }, 10_000);
  force.unref();

  server.close(async () => {
    try { await pool.end(); clearTimeout(force); logger.info('连接池已释放，退出'); process.exit(0); }
    catch (e) { logger.error('释放连接池失败', { err: e.message }); process.exit(1); }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (r) => logger.error('未处理的 Promise 拒绝', { err: String(r) }));
process.on('uncaughtException', (e) => {
  logger.fatal('未捕获异常，进程退出', { err: e.message, stack: e.stack?.split('\n').slice(0, 3) });
  process.exit(1);
});
