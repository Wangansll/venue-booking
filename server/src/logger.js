/** 结构化 JSON 日志：开发环境带颜色，生产环境单行 JSON 便于采集 */
import config from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const current = LEVELS[process.env.LOG_LEVEL] ?? (config.isProd ? LEVELS.info : LEVELS.debug);

const COLORS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', fatal: '\x1b[35m' };

function emit(level, msg, extra = {}) {
  if (LEVELS[level] < current) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...extra };

  if (config.isProd) {
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    const c = COLORS[level] || '';
    const rid = entry.reqId ? ` \x1b[90m[${entry.reqId}]\x1b[0m` : '';
    const rest = Object.keys(extra).filter(k => k !== 'reqId').length
      ? ' \x1b[90m' + JSON.stringify(Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'reqId'))) + '\x1b[0m'
      : '';
    process.stdout.write(`${c}${level.toUpperCase().padEnd(5)}\x1b[0m ${msg}${rid}${rest}\n`);
  }
}

export const logger = {
  debug: (m, e) => emit('debug', m, e),
  info: (m, e) => emit('info', m, e),
  warn: (m, e) => emit('warn', m, e),
  error: (m, e) => emit('error', m, e),
  fatal: (m, e) => emit('fatal', m, e),
};

/** 子日志器：自动带上请求 ID */
export function childLogger(reqId) {
  return {
    debug: (m, e) => emit('debug', m, { reqId, ...e }),
    info: (m, e) => emit('info', m, { reqId, ...e }),
    warn: (m, e) => emit('warn', m, { reqId, ...e }),
    error: (m, e) => emit('error', m, { reqId, ...e }),
  };
}

export default logger;
