/**
 * 配置：集中读取环境变量，启动时校验，缺失直接退出。
 * 生产环境不允许使用默认密钥。
 */
import 'dotenv/config';

function req(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    console.error(JSON.stringify({ level: 'fatal', msg: `缺少环境变量 ${name}` }));
    process.exit(1);
  }
  return v;
}

function int(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    console.error(JSON.stringify({ level: 'fatal', msg: `环境变量 ${name} 非法: ${raw}` }));
    process.exit(1);
  }
  return n;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const JWT_SECRET = req('JWT_SECRET', isProd ? undefined : 'dev-secret-change-me');
if (isProd) {
  const WEAK = ['change-me', 'changeme', 'please-32chars', 'dev-secret', 'your-secret', 'example', 'password'];
  const lower = JWT_SECRET.toLowerCase();
  if (JWT_SECRET.length < 32) {
    console.error(JSON.stringify({ level: 'fatal', msg: '生产环境 JWT_SECRET 至少 32 位' }));
    process.exit(1);
  }
  const hit = WEAK.find((w) => lower.includes(w));
  if (hit) {
    console.error(JSON.stringify({
      level: 'fatal',
      msg: `JWT_SECRET 含弱口令片段 "${hit}"，长度够也不能用。请用 openssl rand -hex 32 重新生成`,
    }));
    process.exit(1);
  }
}

export const config = {
  env: NODE_ENV,
  isProd,
  port: int('PORT', 8787, 1, 65535),
  // 监听地址：默认 0.0.0.0，否则云平台/容器的端口映射无法访问
  appHost: process.env.HOST || '0.0.0.0',
  db: {
    host: req('DB_HOST', '127.0.0.1'),
    port: int('DB_PORT', 3306, 1, 65535),
    user: req('DB_USER', 'root'),
    password: req('DB_PASS', ''),
    database: req('DB_NAME', 'venue_booking'),
    connectionLimit: int('DB_POOL', 10, 1, 100),
  },
  jwt: {
    secret: JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES || '7d',
  },
  cors: {
    // 逗号分隔白名单；空表示开发环境放开
    origins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  },
  rateLimit: {
    windowMs: int('RL_WINDOW_MS', 60_000, 1000),
    max: int('RL_MAX', 120, 1),
  },
  slowMs: int('SLOW_MS', 500, 10),
};

export default config;
