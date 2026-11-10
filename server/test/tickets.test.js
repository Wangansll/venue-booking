import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/lib.js';

const app = createApp();
let studentToken = '';
let adminToken = '';
let sessionId = 0;

/** 下单辅助：锁座 → 创建订单 */
async function lockAndOrder(seatCount = 1, sid = sessionId) {
  const s = await request(app).get(`/api/sessions/${sid}/seats`)
    .set('Authorization', `Bearer ${studentToken}`);
  const free = s.body.data.seats.filter((x) => x.state === 'free').slice(0, seatCount).map((x) => x.id);
  await request(app).post(`/api/sessions/${sid}/lock`)
    .set('Authorization', `Bearer ${studentToken}`).send({ seatIds: free });
  const o = await request(app).post('/api/orders')
    .set('Authorization', `Bearer ${studentToken}`).send({ sessionId: sid, seatIds: free });
  return { seatIds: free, order: o.body.data, status: o.status, body: o.body };
}


/** 清掉本场次的订单/票/流水/锁，避免留下孤儿数据（对账会报 orphans） */
async function wipeSession(sid) {
  await pool.query('DELETE p FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.session_id=?', [sid]);
  await pool.query('DELETE tk FROM tickets tk JOIN orders o ON o.id=tk.order_id WHERE o.session_id=?', [sid]);
  await pool.query('DELETE oi FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.session_id=?', [sid]);
  await pool.query('DELETE FROM orders WHERE session_id=?', [sid]);
  await pool.query('DELETE FROM seat_locks WHERE session_id=?', [sid]);
}

beforeAll(async () => {
  const s = await request(app).post('/api/auth/login').send({ username: 'student', password: '123456' });
  studentToken = s.body.data.token;
  const a = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  adminToken = a.body.data.token;

  // 建一个 3 天后的场次，保证「开场前 24 小时可退」成立
  const start = new Date(Date.now() + 3 * 86400_000);
  const p = (n) => String(n).padStart(2, '0');
  const startAt = `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())} ${p(start.getHours())}:${p(start.getMinutes())}`;

  const r = await request(app).post('/api/admin/sessions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '测试场次-退票与限购', hall: '测试馆', startAt });
  sessionId = r.body.data.id;

  await wipeSession(sessionId);
});

afterAll(async () => {
  await wipeSession(sessionId);
  // 限购用例创建的独立场次
  const [extra] = await pool.query("SELECT id FROM event_sessions WHERE title LIKE '测试场次%'");
  for (const r of extra) {
    await wipeSession(r.id);
    // ticket_tiers / venue_areas 有外键，必须先删
    await pool.query('DELETE FROM ticket_tiers WHERE session_id=?', [r.id]);
    await pool.query(
      'DELETE FROM seats WHERE area_id IN (SELECT id FROM venue_areas WHERE id IN (SELECT area_id FROM ticket_tiers WHERE session_id=?))', [r.id]);
    await pool.query('DELETE FROM venue_areas WHERE id IN (SELECT area_id FROM ticket_tiers WHERE session_id=?)', [r.id]);
    await pool.query('DELETE FROM event_sessions WHERE id=?', [r.id]);
  }
  await pool.end();
});

describe('支付回调', () => {
  it('回调能把订单结算并出票（不再是空转）', async () => {
    const { order } = await lockAndOrder(1);
    expect(order.orderId).toBeGreaterThan(0);

    const n = await request(app).post('/api/pay/notify')
      .send({ orderNo: order.orderNo, amountCents: order.amount });
    expect(n.status).toBe(200);
    expect(n.body.data.settled).toBe(true);
    expect(n.body.data.tickets).toBe(1);

    const mine = await request(app).get('/api/orders/mine')
      .set('Authorization', `Bearer ${studentToken}`);
    const row = mine.body.data.find((x) => x.orderNo === order.orderNo);
    expect(row.status).toBe('paid');
  });

  it('重复回调幂等，不重复出票', async () => {
    const { order } = await lockAndOrder(1);
    await request(app).post('/api/pay/notify').send({ orderNo: order.orderNo, amountCents: order.amount });
    const again = await request(app).post('/api/pay/notify')
      .send({ orderNo: order.orderNo, amountCents: order.amount });
    expect(again.status).toBe(200);
    expect(again.body.data.duplicated).toBe(true);

    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM tickets WHERE order_id = ?', [order.orderId]);
    expect(Number(rows[0].n)).toBe(1);
  });

  it('回调金额与订单不符时拒绝结算', async () => {
    const { order } = await lockAndOrder(1);
    const r = await request(app).post('/api/pay/notify')
      .send({ orderNo: order.orderNo, amountCents: 1 });
    expect(r.status).toBe(400);
  });
});

describe('限购', () => {
  it('累计超过 6 座被拦', async () => {
    // 独立场次：同文件前面的用例已经买过票，共用场次会互相影响额度
    const start = new Date(Date.now() + 4 * 86400_000);
    const p2 = (n) => String(n).padStart(2, '0');
    const startAt = `${start.getFullYear()}-${p2(start.getMonth() + 1)}-${p2(start.getDate())} ${p2(start.getHours())}:${p2(start.getMinutes())}`;
    const created = await request(app).post('/api/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: '测试场次-限购专用', hall: '测试馆', startAt });
    const limitSid = created.body.data.id;

    const first = await lockAndOrder(6, limitSid);
    expect(first.status).toBe(200);
    await request(app).post('/api/pay/notify').send({ orderNo: first.order.orderNo, amountCents: first.order.amount });

    const extra = await lockAndOrder(1, limitSid);
    expect(extra.status).toBe(409);
    expect(extra.body.code).toBe(40911);
  });
});

describe('二维码', () => {
  it('未登录取码被拒', async () => {
    const [rows] = await pool.query('SELECT code FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE session_id=?) LIMIT 1', [sessionId]);
    const code = rows[0].code;
    const r = await request(app).get(`/api/tickets/${code}/qr.svg`);
    expect(r.status).toBe(401);
  });

  it('本人可取到 SVG', async () => {
    const [rows] = await pool.query('SELECT code FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE session_id=?) LIMIT 1', [sessionId]);
    const r = await request(app).get(`/api/tickets/${rows[0].code}/qr.svg`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('svg');
  });
});

describe('退款', () => {
  it('已核销的票不能退（必须在打款前拦下）', async () => {
    const { order } = await lockAndOrder(1);
    await request(app).post('/api/pay/notify').send({ orderNo: order.orderNo, amountCents: order.amount });

    // 管理员核销这张票
    const [tk] = await pool.query('SELECT code FROM tickets WHERE order_id = ? LIMIT 1', [order.orderId]);
    const r1 = await request(app).post('/api/admin/tickets/redeem')
      .set('Authorization', `Bearer ${adminToken}`).send({ code: tk[0].code });
    expect(r1.status).toBe(200);

    const r2 = await request(app).post(`/api/orders/${order.orderId}/refund`)
      .set('Authorization', `Bearer ${studentToken}`).send({});
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe(40908);

    // 关键：订单必须仍是 paid，不能变成 refunded
    const [o] = await pool.query('SELECT status FROM orders WHERE id = ?', [order.orderId]);
    expect(o[0].status).toBe('paid');
  });

  it('正常退票成功，票与座位都释放，流水渠道不是 mock 写死', async () => {
    const { order, seatIds } = await lockAndOrder(1);
    await request(app).post('/api/pay/notify').send({ orderNo: order.orderNo, amountCents: order.amount });

    const r = await request(app).post(`/api/orders/${order.orderId}/refund`)
      .set('Authorization', `Bearer ${studentToken}`).send({});
    expect(r.status).toBe(200);
    expect(r.body.data.channel).toBe('mock');

    const [o] = await pool.query('SELECT status FROM orders WHERE id = ?', [order.orderId]);
    expect(o[0].status).toBe('refunded');

    const [tk] = await pool.query('SELECT status FROM tickets WHERE order_id = ?', [order.orderId]);
    expect(tk.every((x) => x.status === 'refunded')).toBe(true);

    // 座位回到可售
    const s = await request(app).get(`/api/sessions/${sessionId}/seats`)
      .set('Authorization', `Bearer ${studentToken}`);
    const seat = s.body.data.seats.find((x) => x.id === seatIds[0]);
    expect(seat.state).toBe('free');

    // 流水渠道取自 paymentChannel，不是硬编码
    const [pay] = await pool.query(
      `SELECT channel, status FROM payments WHERE order_id = ? AND source = 'refund'`, [order.orderId]);
    expect(pay.length).toBe(1);
    expect(pay[0].channel).not.toBe('');
    expect(pay[0].status).toBe('refunded');
  });

  it('重复退票返回 409', async () => {
    const { order } = await lockAndOrder(1);
    await request(app).post('/api/pay/notify').send({ orderNo: order.orderNo, amountCents: order.amount });
    await request(app).post(`/api/orders/${order.orderId}/refund`)
      .set('Authorization', `Bearer ${studentToken}`).send({});
    const again = await request(app).post(`/api/orders/${order.orderId}/refund`)
      .set('Authorization', `Bearer ${studentToken}`).send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe(40905);
  });
});

describe('对账', () => {
  it('当日的已支付订单都有流水，账平', async () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const r = await request(app).get(`/api/admin/reconcile?date=${date}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.data.issues.mismatch).toHaveLength(0);
    expect(r.body.data.issues.duplicated).toHaveLength(0);
  });
});
