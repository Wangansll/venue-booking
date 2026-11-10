/**
 * 轻量指标采集（零依赖）
 *
 * 采集：
 *   - 请求总数 / 错误数（按状态码分档）
 *   - 延迟直方图（用于算 P50/P95/P99）
 *   - 按路由的计数（路径中的数字 ID 归一化为 :id，避免维度爆炸）
 *   - 进程内存、运行时长
 *
 * 输出：Prometheus 文本格式，供 /api/metrics 暴露。
 */
const LATENCY_BUCKETS = [5, 10, 25, 50, 100, 200, 300, 500, 800, 1200, 2000, 5000];

const state = {
  startedAt: Date.now(),
  requests: 0,
  errors: 0,          // 5xx
  clientErrors: 0,    // 4xx
  byStatus: new Map(), // status -> count
  byRoute: new Map(),  // "METHOD /api/path" -> { count, sumMs }
  buckets: new Array(LATENCY_BUCKETS.length).fill(0),
  bucketOverflow: 0,
  latencySum: 0,
  latencyCount: 0,
  slow: 0,
};

/** 把 /sessions/12/seats 归一化成 /sessions/:id/seats */
export function normalizePath(p) {
  return (p || '')
    .split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}(?=\/|$)/gi, '/:uuid');
}

export function recordRequest(method, path, status, ms) {
  state.requests += 1;
  if (status >= 500) state.errors += 1;
  else if (status >= 400) state.clientErrors += 1;

  state.byStatus.set(status, (state.byStatus.get(status) || 0) + 1);

  const key = `${method} ${normalizePath(path)}`;
  const r = state.byRoute.get(key) || { count: 0, sumMs: 0 };
  r.count += 1;
  r.sumMs += ms;
  state.byRoute.set(key, r);

  state.latencySum += ms;
  state.latencyCount += 1;
  if (ms > 800) state.slow += 1;

  let placed = false;
  for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
    if (ms <= LATENCY_BUCKETS[i]) { state.buckets[i] += 1; placed = true; break; }
  }
  if (!placed) state.bucketOverflow += 1;
}

/** 由直方图估算分位（桶内线性插值，够用且常数内存） */
export function percentile(p) {
  const total = state.latencyCount;
  if (!total) return 0;
  const target = (p / 100) * total;
  let acc = 0;
  let prev = 0;
  for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
    acc += state.buckets[i];
    if (acc >= target) {
      const inBucket = state.buckets[i];
      const frac = inBucket ? (target - (acc - inBucket)) / inBucket : 0;
      return prev + (LATENCY_BUCKETS[i] - prev) * frac;
    }
    prev = LATENCY_BUCKETS[i];
  }
  return LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1];
}

export function snapshot() {
  return {
    uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000),
    requests: state.requests,
    errors: state.errors,
    clientErrors: state.clientErrors,
    errorRate: state.requests ? state.errors / state.requests : 0,
    slowRate: state.requests ? state.slow / state.requests : 0,
    avgMs: state.latencyCount ? state.latencySum / state.latencyCount : 0,
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    maxMs: state.bucketOverflow ? LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1] : LATENCY_BUCKETS[Math.max(0, state.buckets.findIndex((_, i, a) => a.slice(i).some(Boolean)))],
    slow: state.slow,
    byStatus: Object.fromEntries([...state.byStatus].sort((a, b) => a[0] - b[0])),
    byRoute: [...state.byRoute]
      .map(([k, v]) => ({ route: k, count: v.count, avgMs: +(v.sumMs / v.count).toFixed(1) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    memoryMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(1),
  };
}

/** Prometheus 文本格式 */
export function toPrometheus() {
  const s = snapshot();
  const lines = [];
  const g = (name, help, type, value, labels = '') =>
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, `${name}${labels} ${value}`);

  g('venue_uptime_seconds', '进程运行时长', 'gauge', s.uptimeSec);
  g('venue_requests_total', '累计请求数', 'counter', s.requests);
  g('venue_errors_total', '累计 5xx 数', 'counter', s.errors);
  g('venue_client_errors_total', '累计 4xx 数', 'counter', s.clientErrors);
  g('venue_request_duration_p50_ms', '延迟 P50', 'gauge', s.p50.toFixed(1));
  g('venue_request_duration_p95_ms', '延迟 P95', 'gauge', s.p95.toFixed(1));
  g('venue_request_duration_p99_ms', '延迟 P99', 'gauge', s.p99.toFixed(1));
  g('venue_slow_requests_total', '超过 800ms 的请求数', 'counter', s.slow);
  g('venue_memory_rss_mb', '常驻内存', 'gauge', s.memoryMB);

  lines.push('# HELP venue_http_requests_total 按路由的请求数', '# TYPE venue_http_requests_total counter');
  for (const r of s.byRoute) {
    const [m, p] = r.route.split(' ');
    lines.push(`venue_http_requests_total{method="${m}",path="${p}"} ${r.count}`);
  }
  return lines.join('\n') + '\n';
}

export default { recordRequest, snapshot, toPrometheus, normalizePath, percentile };
