#!/usr/bin/env node
/**
 * 零依赖压测脚本
 *
 * 用法：node tools/loadtest.mjs [--url=http://127.0.0.1:8788] [--c=50] [--n=2000]
 *
 * 做法：固定并发 worker 池抢任务队列，统计每次请求耗时，
 *      最后输出 P50/P90/P95/P99/Max、RPS、错误率，并落一份 JSON 报告。
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};

const BASE = arg('url', 'http://127.0.0.1:8788');
const CONCURRENCY = Number(arg('c', '50'));
const TOTAL = Number(arg('n', '2000'));
const OUT = arg('out', 'reports/loadtest.json');

// 被测端点：读多写一，覆盖鉴权、数据库、聚合查询
const SCENARIOS = [
  { method: 'GET', path: '/api/health', weight: 2, name: 'health' },
  { method: 'GET', path: '/api/venues', weight: 3, name: 'venues（需鉴权 + 查库）', auth: true },
  { method: 'GET', path: '/api/sessions', weight: 3, name: 'sessions（子查询聚合）' },
  { method: 'GET', path: '/api/home', weight: 2, name: 'home（4 表并发查询）' },
  { method: 'GET', path: '/api/articles?type=news&size=6', weight: 2, name: 'articles（分页）' },
];

const pool = [];
for (const s of SCENARIOS) for (let i = 0; i < s.weight; i++) pool.push(s);

const latencies = [];
let ok = 0;
let failed = 0;
const errsByCode = new Map();

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'student', password: '123456' }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('登录失败: ' + j.msg);
  return j.data.token;
}

async function one(token, scenario) {
  const t0 = performance.now();
  try {
    const headers = scenario.auth ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(BASE + scenario.path, { method: scenario.method, headers });
    await res.arrayBuffer();          // 读完响应体，别只算 TTFB
    const ms = performance.now() - t0;
    latencies.push(ms);
    if (res.ok) ok += 1;
    else { failed += 1; errsByCode.set(res.status, (errsByCode.get(res.status) || 0) + 1); }
  } catch (e) {
    failed += 1;
    latencies.push(performance.now() - t0);
    errsByCode.set('ERR', (errsByCode.get('ERR') || 0) + 1);
  }
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

const main = async () => {
  console.log(`目标 ${BASE}　并发 ${CONCURRENCY}　总请求 ${TOTAL}`);
  const token = await login();
  console.log('登录 OK，开始压测…\n');

  // 一次共享任务队列，worker 抢活儿
  let next = 0;
  const started = performance.now();

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= TOTAL) break;
      const scenario = pool[i % pool.length];
      await one(token, scenario);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsed = (performance.now() - started) / 1000;

  const sorted = latencies.slice().sort((a, b) => a - b);
  const report = {
    target: BASE,
    concurrency: CONCURRENCY,
    total: TOTAL,
    elapsedSec: +elapsed.toFixed(2),
    rps: +(TOTAL / elapsed).toFixed(1),
    ok,
    failed,
    errorRate: +(failed / TOTAL * 100).toFixed(2),
    errorsByCode: Object.fromEntries(errsByCode),
    latencyMs: {
      min: +sorted[0]?.toFixed(1),
      p50: +pct(sorted, 50).toFixed(1),
      p90: +pct(sorted, 90).toFixed(1),
      p95: +pct(sorted, 95).toFixed(1),
      p99: +pct(sorted, 99).toFixed(1),
      max: +sorted[sorted.length - 1]?.toFixed(1),
      avg: +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1),
    },
    at: new Date().toISOString(),
  };

  console.table({
    并发: CONCURRENCY,
    总请求: TOTAL,
    耗时秒: report.elapsedSec,
    吞吐RPS: report.rps,
    成功率: `${(100 - report.errorRate).toFixed(2)}%`,
    P50: `${report.latencyMs.p50} ms`,
    P95: `${report.latencyMs.p95} ms`,
    P99: `${report.latencyMs.p99} ms`,
    Max: `${report.latencyMs.max} ms`,
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n报告已写入 ${OUT}`);

  // 阈值判定：P95 > 300ms 或 错误率 > 1% 视为不通过
  if (report.latencyMs.p95 > 300 || report.errorRate > 1) {
    console.error('\n✗ 未达标：P95 应 ≤ 300ms，错误率应 ≤ 1%');
    process.exitCode = 1;
  } else {
    console.log('\n✓ 达标：P95 ≤ 300ms，错误率 ≤ 1%');
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
