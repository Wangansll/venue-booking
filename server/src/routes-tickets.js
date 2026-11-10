import { Router } from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { payment, paymentChannel } from './providers/payment.js';
import { notify } from './providers/notify.js';
import { q, tx, authRequired, adminRequired, ok, fail, wrap } from './lib.js';
import { AppError } from './errors.js';

export const ticketRouter = Router();

const LOCK_MINUTES = 15;
const MAX_SEATS_PER_SESSION = 6;          // 单场单人限购，防黄牛清场

/** 票码签名：二维码里不是裸票码，而是 code.exp.sig，可校验时效 */
const QR_SECRET = process.env.TICKET_QR_SECRET || process.env.JWT_SECRET || 'dev-qr-secret';
function signTicket(code, exp) {
  return crypto.createHmac('sha256', QR_SECRET).update(`${code}.${exp}`).digest('hex').slice(0, 16).toUpperCase();
}
function makeTicketPayload(code, ttlMin = 30) {
  const exp = Math.floor(Date.now() / 1000) + ttlMin * 60;
  return `${code}.${exp}.${signTicket(code, exp)}`;
}
function parseTicketPayload(raw) {
  const m = String(raw || '').trim().match(/^([A-Z0-9]{6,12})\.(\d+)\.([A-F0-9]{16})$/);
  if (!m) return { code: String(raw || '').trim().toUpperCase(), signed: false };
  const [, code, expStr, sig] = m;
  const exp = Number(expStr);
  if (sig !== signTicket(code, exp)) return { code, signed: true, ok: false, reason: 'signature' };
  if (Date.now() / 1000 > exp) return { code, signed: true, ok: false, reason: 'expired' };
  return { code, signed: true, ok: true };
}

/**
 * 结算订单：置 paid + 出票（幂等）。
 * 支付接口（mock 直接成功）和渠道回调都走这里，保证两条路行为一致。
 */
async function settleOrder(conn, orderId) {
  const [rows] = await conn.query(
    'SELECT id, amount_cents FROM orders WHERE id = ? FOR UPDATE', [orderId]);
  if (!rows.length) throw new AppError(40401, '订单不存在');
  if (rows[0].status === 1) return { alreadyPaid: true };

  const [st] = await conn.query('SELECT status FROM orders WHERE id = ?', [orderId]);
  if (st[0].status === 'paid') return { alreadyPaid: true };
  if (st[0].status !== 'pending') throw new AppError(40906, `订单状态 ${st[0].status} 不可支付`);

  await conn.query(`UPDATE orders SET status='paid', paid_at=NOW() WHERE id = ?`, [orderId]);

  // 落支付流水（对账用）；transaction_id 有唯一索引，重复回调不会写两条
  await conn.query(
    `INSERT IGNORE INTO payments (order_id, order_no, channel, out_trade_no, transaction_id, amount_cents, status, source)
     VALUES (?, ?, ?, ?, ?, ?, 'success', ?)`,
    [orderId, (await conn.query('SELECT order_no FROM orders WHERE id = ?', [orderId]))[0][0].order_no,
     'mock', 'MOCKOUT' + orderId, 'MOCKTX' + orderId, rows[0].amount_cents, 'mock_pay']);

  const [items] = await conn.query('SELECT seat_id FROM order_items WHERE order_id = ?', [orderId]);
  for (const it of items) {
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    await conn.query('INSERT INTO tickets (order_id, seat_id, code) VALUES (?, ?, ?)', [orderId, it.seat_id, code]);
  }
  await conn.query(
    'DELETE FROM seat_locks WHERE user_id = (SELECT user_id FROM orders WHERE id = ?) AND session_id = (SELECT session_id FROM orders WHERE id = ?)',
    [orderId, orderId]);
  return { paid: true, tickets: items.length, amountCents: rows[0].amount_cents };
}

// ═══════════ 场次 ═══════════
ticketRouter.get('/sessions', wrap(async (_req, res) => {
  const rows = await q(
    `SELECT s.id, s.title, s.cover, s.start_at AS startAt, s.hall, s.status,
            (SELECT MIN(t.price_cents) FROM ticket_tiers t WHERE t.session_id = s.id) AS minPriceCents,
            (SELECT COUNT(*) FROM seats se2 JOIN ticket_tiers t2 ON t2.area_id=se2.area_id AND t2.session_id=s.id) AS totalSeats,
            (SELECT COUNT(*) FROM order_items oi
               JOIN orders o ON o.id = oi.order_id
              WHERE o.session_id = s.id AND o.status = 'paid') AS soldSeats
       FROM event_sessions s
      ORDER BY s.start_at`);
  ok(res, rows);
}));

// ═══════════ 座位图（含已售 / 已锁） ═══════════
ticketRouter.get('/sessions/:id/seats', authRequired, wrap(async (req, res) => {
  const sid = Number(req.params.id);
  const sessions = await q('SELECT id, title, start_at AS startAt, hall FROM event_sessions WHERE id = ?', [sid]);
  if (!sessions.length) return fail(res, 404, 40401, '场次不存在');

  const areas = await q(
    `SELECT a.id, a.name, a.color, a.row_count AS rowCount, a.col_count AS colCount,
            t.price_cents AS priceCents
       FROM venue_areas a
       JOIN ticket_tiers t ON t.area_id = a.id AND t.session_id = ?
      ORDER BY a.id`, [sid]);

  // 只取本场次分区下的座位（多场次各自独立建区），否则会串到别的场次
  const seats = await q(
    `SELECT se.id, se.area_id AS areaId, se.row_no AS rowNo, se.seat_no AS seatNo
       FROM seats se
       JOIN ticket_tiers t ON t.area_id = se.area_id AND t.session_id = ?
      WHERE se.enabled = 1
      ORDER BY se.area_id, se.row_no, se.seat_no`, [sid]);

  const sold = await q(
    `SELECT oi.seat_id AS seatId FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.session_id = ? AND o.status = 'paid'`, [sid]);

  const locked = await q(
    `SELECT seat_id AS seatId, user_id AS userId, expire_at AS expireAt FROM seat_locks
      WHERE session_id = ? AND expire_at > NOW()`, [sid]);

  // 我自己的锁里最晚的到期时间 —— 前端据此恢复倒计时（刷新页面不丢）
  const myLocks = locked.filter((r) => r.userId === req.user.uid);
  const myLockExpireAt = myLocks.length
    ? new Date(Math.max(...myLocks.map((r) => new Date(r.expireAt).getTime()))).toISOString()
    : null;

  const soldSet = new Set(sold.map((r) => r.seatId));
  const lockMap = new Map(locked.map((r) => [r.seatId, r.userId]));

  const out = seats.map((se) => {
    let state = 'free';
    if (soldSet.has(se.id)) state = 'sold';
    else if (lockMap.has(se.id)) state = lockMap.get(se.id) === req.user.uid ? 'mine' : 'locked';
    return { ...se, state };
  });

  ok(res, { session: sessions[0], areas, seats: out, lockMinutes: LOCK_MINUTES, myLockExpireAt });
}));

// ═══════════ 锁座（唯一索引防并发） ═══════════
ticketRouter.post('/sessions/:id/lock', authRequired, wrap(async (req, res) => {
  const sid = Number(req.params.id);
  const ids = Array.isArray(req.body?.seatIds) ? req.body.seatIds.map(Number).filter(Boolean) : [];
  if (!ids.length) throw new AppError(40000, '请先选择座位');
  if (ids.length > 6) throw new AppError(40000, '一次最多选择 6 个座位');

  try {
    await tx(async (conn) => {
      // 已售出的座位不允许再锁（否则会出现「卖了的座又被锁」）
      const [sold] = await conn.query(
        `SELECT oi.seat_id AS seatId FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE o.session_id = ? AND o.status = 'paid' AND oi.seat_id IN (?)`, [sid, ids]);
      if (sold.length) {
        throw Object.assign(new Error('有座位已售出，请重新选择'), { http: 409, code: 40902 });
      }

      // 清掉自己过期的锁，避免自己锁自己
      await conn.query('DELETE FROM seat_locks WHERE session_id = ? AND user_id = ?', [sid, req.user.uid]);
      await conn.query('DELETE FROM seat_locks WHERE expire_at < NOW()');

      const values = ids.map(() => '(?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))').join(',');
      const args = [];
      for (const id of ids) args.push(sid, id, req.user.uid, LOCK_MINUTES);
      await conn.query(
        `INSERT INTO seat_locks (session_id, seat_id, user_id, expire_at) VALUES ${values}`, args);
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 409, 40902, '有座位刚被别人选走，请重新选择');
    if (e.http) return fail(res, e.http, e.code, e.message);
    throw e;
  }

  ok(res, { expireInSeconds: LOCK_MINUTES * 60 }, '座位已为你保留 15 分钟');
}));

// ═══════════ 下单（金额只由服务端算） ═══════════
ticketRouter.post('/orders', authRequired, wrap(async (req, res) => {
  const sid = Number(req.body?.sessionId);
  const seatIds = Array.isArray(req.body?.seatIds) ? req.body.seatIds.map(Number).filter(Boolean) : [];
  if (!sid || !seatIds.length) throw new AppError(40000, '参数不合法');

  try {
    const result = await tx(async (conn) => {
      // 锁必须属于我且未过期
      const [locks] = await conn.query(
        `SELECT seat_id FROM seat_locks
          WHERE session_id = ? AND user_id = ? AND expire_at > NOW() AND seat_id IN (?)`,
        [sid, req.user.uid, seatIds]);
      if (locks.length !== seatIds.length) {
        throw new AppError(40903);
      }

      // 价格一律服务端按票档取，忽略前端传的金额
      // 限购：该用户在本场已买（pending/paid）的座位数 + 本次 不得超过上限
      const [mine] = await conn.query(
        `SELECT COUNT(*) AS n FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE o.session_id = ? AND o.user_id = ? AND o.status IN ('pending','paid')`,
        [sid, req.user.uid]);
      if (mine[0].n + seatIds.length > MAX_SEATS_PER_SESSION) {
        throw new AppError(40911, `单场最多购买 ${MAX_SEATS_PER_SESSION} 个座位（已购 ${mine[0].n} 个）`);
      }

      const [priced] = await conn.query(
        `SELECT se.id AS seatId, t.price_cents AS price
           FROM seats se
           JOIN ticket_tiers t ON t.area_id = se.area_id AND t.session_id = ?
          WHERE se.id IN (?)`, [sid, seatIds]);
      if (priced.length !== seatIds.length) {
        throw new AppError(40404);
      }

      const amount = priced.reduce((s, r) => s + r.price, 0);
      const orderNo = 'T' + Date.now().toString().slice(-10) + crypto.randomInt(1000, 9999);

      const [o] = await conn.query(
        `INSERT INTO orders (order_no, user_id, session_id, amount_cents) VALUES (?, ?, ?, ?)`,
        [orderNo, req.user.uid, sid, amount]);
      const orderId = o.insertId;

      const vals = priced.map(() => '(?, ?, ?)').join(',');
      const args = [];
      for (const r of priced) args.push(orderId, r.seatId, r.price);
      await conn.query(`INSERT INTO order_items (order_id, seat_id, price_cents) VALUES ${vals}`, args);

      return { orderId, orderNo, amount };
    });

    ok(res, result, '订单已创建，请支付');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 409, 40902, '座位已被占用');
    if (e.http) return fail(res, e.http, e.code, e.message);
    throw e;
  }
}));

// ═══════════ 支付（provider 抽象：mock / wechat） ═══════════
ticketRouter.post('/orders/:id/pay', authRequired, wrap(async (req, res) => {
  const id = Number(req.params.id);

  const result = await tx(async (conn) => {
    const [rows] = await conn.query(
      'SELECT id, user_id, status, amount_cents, order_no FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) throw new AppError(40401, '订单不存在');
    const o = rows[0];
    if (o.user_id !== req.user.uid) throw new AppError(40300, '无权操作');
    if (o.status === 'paid') return { orderId: id, alreadyPaid: true };

    const payInfo = await payment.createPayment({
      orderNo: o.order_no, amountCents: o.amount_cents, orderId: id,
    });

    // 真实渠道：返回支付参数，状态等回调再置
    if (payInfo.channel !== 'mock') {
      return { orderId: id, needPay: true, payParams: payInfo.payParams, channel: payInfo.channel };
    }

    // mock：直接结算
    await conn.query(`UPDATE orders SET pay_channel = ? WHERE id = ?`, ['mock', id]);
    const settled = await settleOrder(conn, id);
    const [sess] = await conn.query(
      'SELECT s.title FROM event_sessions s JOIN orders o2 ON o2.session_id = s.id WHERE o2.id = ?', [id]);
    return {
      orderId: id, ...settled, channel: 'mock',
      notifyText: { session: sess[0]?.title ?? '', seats: settled.tickets, amountCents: o.amount_cents },
    };
  });

  if (result.notifyText) await notify({ template: 'ticket_paid', data: result.notifyText });
  ok(res, result, result.alreadyPaid ? '订单已支付' : '支付成功，电子票已生成');
}));

// ═══════════ 退票 ═══════════
/**
 * 顺序很关键：**先校验、再占位、后打款、最后落账**。
 *
 * 反过来的做法（先调渠道退款、再校验）在真实渠道下是资金事故：
 * 钱已经退出去，校验失败抛错回滚，DB 看起来像没退过 → 用户既能进场又能再退一次。
 *
 * 因此拆成两个事务：
 *   ① 校验 + 置 refunding（提交）—— 拿到「这张单归我处理」的独占状态
 *   ② 打款（网络调用，不在事务里）→ 成功就置 refunded；失败则回滚到 paid 并记录原因
 */
ticketRouter.post('/orders/:id/refund', authRequired, wrap(async (req, res) => {
  const id = Number(req.params.id);

  // ① 校验 + 占位：这一步不产生任何资金动作
  const claim = await tx(async (conn) => {
    const [rows] = await conn.query(
      `SELECT o.id, o.user_id, o.status, o.amount_cents, o.order_no,
              s.start_at AS startAt, s.title
         FROM orders o JOIN event_sessions s ON s.id = o.session_id
        WHERE o.id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw new AppError(40401, '订单不存在');
    const o = rows[0];
    if (o.user_id !== req.user.uid) throw new AppError(40300, '无权操作');
    if (o.status === 'refunded') throw new AppError(40905);
    if (o.status === 'refunding') throw new AppError(40912);
    if (o.status !== 'paid') throw new AppError(40906);

    const hoursLeft = (new Date(o.startAt).getTime() - Date.now()) / 3600_000;
    if (hoursLeft <= 24) {
      throw new AppError(40907, `开场前 24 小时起不可退票（距开场 ${hoursLeft.toFixed(1)} 小时）`);
    }

    // 已核销的票不能退 —— 必须在打款之前拦
    const [used] = await conn.query(
      `SELECT COUNT(*) AS n FROM tickets WHERE order_id = ? AND status = 'used'`, [id]);
    if (used[0].n > 0) throw new AppError(40908, `该订单已有 ${used[0].n} 张票核销，不能退`);

    // 占位：状态机从 paid → refunding，防并发重复退
    await conn.query(`UPDATE orders SET status = 'refunding', refund_error = NULL WHERE id = ?`, [id]);
    return o;
  });

  // ② 打款：网络调用放在事务外，失败要能补偿
  try {
    await payment.refund({ orderNo: claim.order_no }, claim.amount_cents);
  } catch (e) {
    await q(`UPDATE orders SET status = 'paid', refund_error = ? WHERE id = ?`,
      [String(e.message || 'refund failed').slice(0, 200), id]);
    throw new AppError(50300, `渠道退款失败，订单已回退为已支付：${e.message}`);
  }

  // ③ 落账：订单 + 票 + 流水（渠道名取真实 channel，不能写死 mock）
  await tx(async (conn) => {
    await conn.query(`UPDATE orders SET status = 'refunded' WHERE id = ?`, [id]);
    await conn.query(`UPDATE tickets SET status = 'refunded' WHERE order_id = ? AND status = 'valid'`, [id]);
    await conn.query(
      `INSERT INTO payments (order_id, order_no, channel, out_trade_no, transaction_id, amount_cents, status, source)
       VALUES (?, ?, ?, ?, ?, ?, 'refunded', 'refund')`,
      [id, claim.order_no, paymentChannel,
       `REFUNDOUT${id}`, `REFUNDTX${id}${Date.now()}`, claim.amount_cents]);
  });

  await notify({ template: 'ticket_refunded', data: { session: claim.title, amountCents: claim.amount_cents } });
  ok(res, { orderId: id, amountCents: claim.amount_cents, channel: paymentChannel }, '退票成功');
}));

// ═══════════ 支付回调（真实渠道用）═══════════
ticketRouter.post('/pay/notify', wrap(async (req, res) => {
  const raw = req.rawBody || JSON.stringify(req.body || {});
  const v = await payment.verifyNotify(req.headers, raw);
  if (!v.ok) return fail(res, 400, 40000, `回执校验失败：${v.reason || 'invalid'}`);

  const rows = await q('SELECT id, status, amount_cents FROM orders WHERE order_no = ?', [v.orderNo]);
  if (!rows.length) return fail(res, 404, 40401, '订单不存在');

  // 金额校验：回调金额与订单不符视为异常，不结算
  if (v.amountCents && v.amountCents !== rows[0].amount_cents) {
    return fail(res, 400, 40000, `金额不符：回调 ${v.amountCents} vs 订单 ${rows[0].amount_cents}`);
  }

  // 幂等：已支付直接回成功，不重复出票
  if (rows[0].status === 'paid') return ok(res, { duplicated: true });

  // 真的结算：置 paid + 出票（和 /orders/:id/pay 共用同一段逻辑）
  const settled = await tx(async (conn) => {
    await conn.query('UPDATE orders SET pay_channel = ? WHERE id = ?', ['wechat', rows[0].id]);
    return settleOrder(conn, rows[0].id);
  });

  const [sess] = await q(
    'SELECT s.title FROM event_sessions s JOIN orders o ON o.session_id = s.id WHERE o.id = ?', [rows[0].id]);
  await notify({
    template: 'ticket_paid',
    data: { session: sess[0]?.title ?? '', seats: settled.tickets, amountCents: rows[0].amount_cents },
  });

  ok(res, { settled: true, tickets: settled.tickets });
}));

// ═══════════ 我的订单 / 票 ═══════════
ticketRouter.get('/orders/mine', authRequired, wrap(async (req, res) => {
  const rows = await q(
    `SELECT o.id, o.order_no AS orderNo, o.amount_cents AS amountCents, o.status,
            o.created_at AS createdAt, s.title, s.start_at AS startAt, s.hall,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS seatCount
       FROM orders o JOIN event_sessions s ON s.id = o.session_id
      WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 50`, [req.user.uid]);
  ok(res, rows);
}));

ticketRouter.get('/tickets/mine', authRequired, wrap(async (req, res) => {
  const rows = await q(
    `SELECT tk.id, tk.order_id AS orderId, tk.code, tk.status, s.title, s.start_at AS startAt, s.hall,
            a.name AS areaName, se.row_no AS rowNo, se.seat_no AS seatNo
       FROM tickets tk
       JOIN orders o ON o.id = tk.order_id
       JOIN event_sessions s ON s.id = o.session_id
       JOIN seats se ON se.id = tk.seat_id
       JOIN venue_areas a ON a.id = se.area_id
      WHERE o.user_id = ?
      ORDER BY s.start_at DESC, tk.id`, [req.user.uid]);
  ok(res, rows);
}));

// ═══════════ 对账 ═══════════
// 三件事：① 订单有记录但无流水 ② 流水金额与订单不符 ③ 同一订单多条成功流水
ticketRouter.get('/admin/reconcile', authRequired, adminRequired, wrap(async (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(40002, '日期格式应为 YYYY-MM-DD');

  // 当日已支付订单
  const orders = await q(
    `SELECT id, order_no AS orderNo, amount_cents AS amountCents
       FROM orders WHERE status = 'paid' AND DATE(paid_at) = ?`, [date]);

  // 当日成功流水
  const pays = await q(
    `SELECT p.order_id AS orderId, p.amount_cents AS amountCents, COUNT(*) AS cnt
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.status = 'success' AND o.status = 'paid' AND DATE(o.paid_at) = ?
      GROUP BY p.order_id, p.amount_cents`, [date]);

  const payMap = new Map();
  for (const p of pays) payMap.set(p.orderId, p);

  const missing = [];      // 付了钱但没流水
  const mismatch = [];     // 金额不符
  const duplicated = [];   // 重复流水
  for (const o of orders) {
    const p = payMap.get(o.id);
    if (!p) { missing.push({ orderId: o.id, orderNo: o.orderNo, amountCents: o.amountCents }); continue; }
    if (Number(p.amountCents) !== Number(o.amountCents)) {
      mismatch.push({ orderId: o.id, orderNo: o.orderNo, orderAmount: o.amountCents, payAmount: p.amountCents });
    }
    if (Number(p.cnt) > 1) duplicated.push({ orderId: o.id, orderNo: o.orderNo, count: Number(p.cnt) });
  }

  // 孤儿流水 = 订单**根本不存在**。
  // 已退款/已取消的订单也有流水，那是正常的，不能算孤儿（之前误判过）。
  const allPayOrderIds = [...payMap.keys()];
  const existing = allPayOrderIds.length
    ? await q('SELECT id FROM orders WHERE id IN (?)', [allPayOrderIds])
    : [];
  const existingIds = new Set(existing.map((r) => r.id));
  const orphans = allPayOrderIds
    .filter((oid) => !existingIds.has(oid))
    .map((oid) => ({ orderId: oid, amountCents: payMap.get(oid).amountCents }));

  const totalOrder = orders.reduce((s2, o) => s2 + Number(o.amountCents), 0);
  const totalPay = [...payMap.values()].reduce((s2, p) => s2 + Number(p.amountCents), 0);

  ok(res, {
    date,
    orders: orders.length,
    payments: [...payMap.values()].reduce((s2, p) => s2 + Number(p.cnt), 0),
    totalOrderCents: totalOrder,
    totalPayCents: totalPay,
    diffCents: totalPay - totalOrder,
    issues: { missing, mismatch, duplicated, orphans },
    balanced: missing.length === 0 && mismatch.length === 0 && duplicated.length === 0
      && orphans.length === 0 && totalPay - totalOrder === 0,
  });
}));

// ═══════════ 后台：场次管理 ═══════════
// 列表：带售票数、核销数，运营能一眼看到这场卖了多少
ticketRouter.get('/admin/sessions', authRequired, adminRequired, wrap(async (_req, res) => {
  const rows = await q(
    `SELECT s.id, s.title, s.start_at AS startAt, s.hall, s.status, s.cover,
            (SELECT COUNT(*) FROM seats se2 JOIN ticket_tiers t2 ON t2.area_id=se2.area_id AND t2.session_id=s.id) AS totalSeats,
            (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id=oi.order_id
              WHERE o.session_id=s.id AND o.status='paid') AS soldSeats,
            (SELECT CAST(COALESCE(SUM(o.amount_cents),0) AS UNSIGNED) FROM orders o
              WHERE o.session_id=s.id AND o.status='paid') AS revenueCents,
            (SELECT COUNT(*) FROM tickets tk JOIN orders o2 ON o2.id=tk.order_id
              WHERE o2.session_id=s.id AND tk.status='used') AS redeemed
       FROM event_sessions s ORDER BY s.start_at DESC`);
  ok(res, rows);
}));

// 创建场次：按「分区规格」自动生成座位与票档，运营不用碰数据库
ticketRouter.post('/admin/sessions', authRequired, adminRequired, wrap(async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const hall = String(b.hall || '').trim();
  const startAt = String(b.startAt || '').trim();
  if (!title || !hall || !startAt) throw new AppError(40000, '标题、场馆、开场时间都不能为空');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(startAt)) throw new AppError(40000, '开场时间格式应为 YYYY-MM-DD HH:mm');

  // 分区规格：默认 3 区，每区 6 排 × 10 座；价格可按区传
  const zones = Array.isArray(b.zones) && b.zones.length ? b.zones : [
    { name: 'A 区内场', color: '#3b6ef5', rows: 6, cols: 10, price: 28000 },
    { name: 'B 区看台', color: '#8b5cf6', rows: 6, cols: 10, price: 18000 },
    { name: 'C 区看台', color: '#0f9d58', rows: 6, cols: 10, price: 8000 },
  ];

  const created = await tx(async (conn) => {
    const [s0] = await conn.query(
      'INSERT INTO event_sessions (title, cover, start_at, hall) VALUES (?, ?, ?, ?)',
      [title.slice(0, 120), b.cover || null, startAt, hall.slice(0, 64)]);
    const sid0 = s0.insertId;

    let seatCount = 0;
    for (const z of zones) {
      const [a] = await conn.query(
        'INSERT INTO venue_areas (name, color, row_count, col_count) VALUES (?, ?, ?, ?)',
        [String(z.name || '区域').slice(0, 32), z.color || '#3b6ef5', Number(z.rows) || 6, Number(z.cols) || 10]);
      const areaId = a.insertId;

      await conn.query('INSERT INTO ticket_tiers (session_id, area_id, name, price_cents) VALUES (?, ?, ?, ?)',
        [sid0, areaId, String(z.name || '区域').slice(0, 32), Math.max(0, Number(z.price) || 0)]);

      const vals = [], args = [];
      for (let r0 = 1; r0 <= (Number(z.rows) || 6); r0++) {
        for (let c0 = 1; c0 <= (Number(z.cols) || 10); c0++) {
          vals.push('(?, ?, ?, 1)'); args.push(areaId, r0, c0);
          seatCount += 1;
        }
      }
      await conn.query(`INSERT INTO seats (area_id, row_no, seat_no, enabled) VALUES ${vals.join(',')}`, args);
    }
    return { id: sid0, seatCount, zones: zones.length };
  });

  ok(res, created, `场次已创建，自动生成 ${created.seatCount} 个座位`);
}));

// 上下架
ticketRouter.post('/admin/sessions/:id/status', authRequired, adminRequired, wrap(async (req, res) => {
  const st = String(req.body?.status || '');
  if (!['on_sale', 'sold_out', 'finished', 'cancelled'].includes(st)) throw new AppError(40000, '状态不合法');
  const r = await q('UPDATE event_sessions SET status = ? WHERE id = ?', [st, Number(req.params.id)]);
  if (!r.affectedRows) return fail(res, 404, 40401, '场次不存在');
  ok(res, null, '已更新');
}));

// ═══════════ 二维码 ═══════════
// 票码渲染成 SVG，前端 <img src="/api/tickets/<code>/qr.svg"> 直接显示。
// 内容就是票码本身；核销端扫码后调用 /admin/tickets/redeem。
ticketRouter.get('/tickets/:code/qr.svg', authRequired, wrap(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9]{6,12}$/.test(code)) return fail(res, 400, 40000, '票码格式不合法');

  // 只能取自己的票；管理员可取任意票
  const rows = await q(
    `SELECT t.code, o.user_id AS userId, t.status
       FROM tickets t JOIN orders o ON o.id = t.order_id
      WHERE t.code = ?`, [code]);
  if (!rows.length) return fail(res, 404, 40401, '票码不存在');
  if (rows[0].userId !== req.user.uid && req.user.role !== 'admin') {
    return fail(res, 403, 40300, '无权查看该票');
  }

  // 二维码内容不是裸票码，而是「票码 + 过期时间 + HMAC 签名」，防止截图复用
  const svg = await QRCode.toString(makeTicketPayload(code), {
    type: 'svg', margin: 1, width: 240,
    color: { dark: '#0f1523', light: '#ffffff' },
  });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
}));

// ═══════════ 核销 ═══════════
ticketRouter.post('/admin/tickets/redeem', authRequired, adminRequired, wrap(async (req, res) => {
  const raw = String(req.body?.code || '').trim();
  if (!raw) throw new AppError(40000, '请填写核销码');

  // 扫码时传签名载荷（code.exp.sig），手输时传纯票码
  const parsed = parseTicketPayload(raw);
  if (parsed.signed && !parsed.ok) {
    throw new AppError(parsed.reason === 'expired' ? 40909 : 40910);
  }
  const code = parsed.code;
  if (!/^[A-Z0-9]{6,12}$/.test(code)) throw new AppError(40000, '核销码格式不正确');

  const r = await q(
    `UPDATE tickets SET status = 'used', used_at = NOW() WHERE code = ? AND status = 'valid'`, [code]);
  if (!r.affectedRows) return fail(res, 409, 40904, '票码无效或已使用');
  ok(res, null, '核销成功');
}));
