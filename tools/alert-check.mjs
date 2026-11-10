#!/usr/bin/env node
/**
 * 告警检查（零依赖）
 *
 * 用法：
 *   node tools/alert-check.mjs                       # 单次检查，退出码 1 表示有告警
 *   node tools/alert-check.mjs --watch=30            # 每 30 秒检查一次
 *
 * 检查项（阈值可用环境变量覆盖）：
 *   - 服务可达           /api/health/ready 必须 200 且 ready:true
 *   - 错误率             5xx / 总请求 > ALERT_ERROR_RATE（默认 1%）
 *   - P95 延迟           > ALERT_P95_MS（默认 300ms）
 *   - 慢请求比例         > ALERT_SLOW_RATE（默认 5%）
 *   - 内存               > ALERT_MEM_MB（默认 800MB）
 *
 * 触发时：控制台输出 + 追加到 logs/alerts.log（JSON 行，便于后续接告警通道）
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};

const BASE = arg('url', process.env.ALERT_URL || 'http://127.0.0.1:8787');
const WATCH = Number(arg('watch', '0'));
const LOG = path.resolve('logs/alerts.log');

const TH = {
  errorRate: Number(process.env.ALERT_ERROR_RATE || 0.01),
  p95: Number(process.env.ALERT_P95_MS || 300),
  slowRate: Number(process.env.ALERT_SLOW_RATE || 0.05),
  memMB: Number(process.env.ALERT_MEM_MB || 800),
};

async function getJson(pathname, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + pathname, { signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

function fire(level, rule, detail) {
  const entry = { ts: new Date().toISOString(), level, rule, detail, target: BASE };
  const line = JSON.stringify(entry);
  console.error(`[${level.toUpperCase()}] ${rule} — ${detail}`);
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, line + '\n');
}

async function checkOnce() {
  const alerts = [];

  // 1) 就绪探针
  let ready;
  try {
    ready = await getJson('/api/health/ready');
  } catch (e) {
    alerts.push(['critical', 'service_unreachable', e.message]);
    return alerts;
  }
  if (ready.status !== 200 || !ready.body?.ready) {
    alerts.push(['critical', 'not_ready', `status=${ready.status} migrations=${ready.body?.migrations ?? '?'}`]);
    return alerts;   // 服务不 ready，后面的指标没有意义
  }

  // 2) 指标
  let stats;
  try {
    stats = await getJson('/api/stats');
  } catch (e) {
    alerts.push(['warning', 'metrics_unavailable', e.message]);
    return alerts;
  }
  const s = stats.body;

  if (s.errorRate > TH.errorRate) {
    alerts.push(['critical', 'error_rate',
      `错误率 ${(s.errorRate * 100).toFixed(2)}% > ${(TH.errorRate * 100).toFixed(2)}%（5xx ${s.errors}/${s.requests}）`]);
  }
  if (s.p95 > TH.p95) {
    alerts.push(['warning', 'latency_p95', `P95 ${s.p95.toFixed(1)}ms > ${TH.p95}ms`]);
  }
  if (s.slowRate > TH.slowRate) {
    alerts.push(['warning', 'slow_ratio',
      `慢请求比例 ${(s.slowRate * 100).toFixed(1)}% > ${(TH.slowRate * 100).toFixed(1)}%`]);
  }
  if (s.memoryMB > TH.memMB) {
    alerts.push(['warning', 'memory', `RSS ${s.memoryMB}MB > ${TH.memMB}MB`]);
  }

  return { alerts, stats: s };
}

async function run() {
  const r = await checkOnce();
  if (Array.isArray(r)) {
    for (const [level, rule, detail] of r) fire(level, rule, detail);
    console.log(`\n✗ ${r.length} 条告警`);
    process.exitCode = 2;
    return;
  }

  if (r.alerts.length) {
    for (const [level, rule, detail] of r.alerts) fire(level, rule, detail);
    console.log(`\n✗ ${r.alerts.length} 条告警（已写入 ${LOG}）`);
    process.exitCode = 2;
  } else {
    const s = r.stats;
    console.log(`✓ 正常　请求 ${s.requests}　错误率 ${(s.errorRate * 100).toFixed(2)}%　`
      + `P95 ${s.p95.toFixed(1)}ms　慢请求 ${(s.slowRate * 100).toFixed(1)}%　内存 ${s.memoryMB}MB`);
  }
}

if (WATCH > 0) {
  console.log(`守护模式：每 ${WATCH}s 检查一次，Ctrl+C 退出`);
  const tick = async () => {
    try { await run(); } catch (e) { console.error(e.message); }
    setTimeout(tick, WATCH * 1000);
  };
  tick();
} else {
  run().catch((e) => { console.error(e); process.exit(1); });
}
