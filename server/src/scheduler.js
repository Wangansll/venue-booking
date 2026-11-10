/**
 * 轻量调度器：每分钟扫一次「30 分钟后开场」的已支付订单，发开场提醒。
 * 单机够用；多实例时需换成分布式锁，否则会重复发（reminded_at 已做幂等兜底）。
 */
import { q } from './lib.js';
import { notify } from './providers/notify.js';
import { logger } from './logger.js';

const WINDOW_MIN = 30;
const TOLERANCE_MIN = 5;
let timer = null;
let running = false;

export async function runOnce() {
  if (running) return { skipped: true };
  running = true;
  try {
    // 开场时间落在 [now+25min, now+35min] 且还没提醒过的已支付订单
    const rows = await q(
      `SELECT o.id, o.user_id, s.title, DATE_FORMAT(s.start_at, '%Y-%m-%d %H:%i') AS startAt
         FROM orders o JOIN event_sessions s ON s.id = o.session_id
        WHERE o.status = 'paid'
          AND o.reminded_at IS NULL
          AND s.start_at BETWEEN DATE_ADD(NOW(), INTERVAL ? MINUTE) AND DATE_ADD(NOW(), INTERVAL ? MINUTE)`,
      [WINDOW_MIN - TOLERANCE_MIN, WINDOW_MIN + TOLERANCE_MIN]);

    for (const r of rows) {
      await notify({ template: 'session_reminder', data: { session: r.title, startAt: r.startAt } });
      await q('UPDATE orders SET reminded_at = NOW() WHERE id = ?', [r.id]);
    }
    if (rows.length) logger.info('[scheduler] 已发送开场提醒', { count: rows.length });
    return { sent: rows.length };
  } catch (e) {
    logger.warn('[scheduler] 执行失败', { err: e.message });
    return { error: e.message };
  } finally {
    running = false;
  }
}

export function startScheduler(intervalMs = 60_000) {
  if (timer) return timer;
  timer = setInterval(() => { void runOnce(); }, intervalMs);
  timer.unref();
  logger.info('[scheduler] 开场提醒已启动', { intervalMs, windowMin: WINDOW_MIN });
  return timer;
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
