#!/usr/bin/env node
/**
 * 日结对账 CLI
 * 用法：node tools/reconcile.mjs [--date=YYYY-MM-DD] [--url=http://127.0.0.1:8787]
 *     需要环境变量 ADMIN_TOKEN（或 --token=xxx）
 *
 * 退出码：0 平衡 / 2 有差异 / 1 执行失败
 * 可挂到 cron 或 GitHub Actions 每日跑一次。
 */
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : d;
};

const BASE = arg('url', process.env.RECONCILE_URL || 'http://127.0.0.1:8787');
const localDate = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const DATE = arg('date', localDate());
let TOKEN = arg('token', process.env.ADMIN_TOKEN || '');

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASS || 'admin123' }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('管理员登录失败：' + j.msg);
  return j.data.token;
}

const main = async () => {
  if (!TOKEN) TOKEN = await login();

  const res = await fetch(`${BASE}/api/admin/reconcile?date=${DATE}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(j.msg);

  const d = j.data;
  const cny = (c) => (c / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

  console.log(`\n对账日期 ${d.date}`);
  console.log('─'.repeat(52));
  console.log(`已支付订单   ${String(d.orders).padStart(4)} 笔   ¥${cny(d.totalOrderCents)}`);
  console.log(`成功流水     ${String(d.payments).padStart(4)} 条   ¥${cny(d.totalPayCents)}`);
  console.log(`差额         ${d.diffCents === 0 ? '0（平）' : '¥' + cny(d.diffCents)}`);
  console.log('─'.repeat(52));

  const names = { missing: '付了钱但无流水', mismatch: '金额不符', duplicated: '重复流水', orphans: '流水找不到订单' };
  let bad = 0;
  for (const [k, v] of Object.entries(d.issues)) {
    if (!v.length) continue;
    bad += v.length;
    console.log(`\n⚠ ${names[k]}（${v.length} 条）`);
    for (const it of v.slice(0, 10)) console.log('   ', JSON.stringify(it));
    if (v.length > 10) console.log(`    …还有 ${v.length - 10} 条`);
  }

  if (d.balanced) {
    console.log('\n✓ 账平');
    process.exitCode = 0;
    return;
  }
  console.log(bad
    ? `\n✗ 发现 ${bad} 处差异，需人工核对`
    : `\n✗ 分类无异常，但总额差额 ¥${cny(d.diffCents)}，需核对（可能有时差/跨日流水）`);
  process.exitCode = 2;
};

main().catch((e) => { console.error('对账失败：', e.message); process.exitCode = 1; });
