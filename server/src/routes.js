import { Router } from 'express';
import {
  q, tx, verifyPassword, signToken, authRequired, adminRequired,
  ok, fail, wrap, SLOT_TEXT,
} from './lib.js';
import { notify } from './providers/notify.js';

export const router = Router();

// ═══════════ 认证 ═══════════
router.post('/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, 400, 40001, '用户名和密码不能为空');

  const rows = await q('SELECT id, username, name, role, password_hash FROM users WHERE username = ?', [username]);
  if (!rows.length) return fail(res, 401, 40102, '用户名或密码错误');

  const u = rows[0];
  if (!verifyPassword(password, u.password_hash)) return fail(res, 401, 40102, '用户名或密码错误');

  ok(res, { token: signToken(u), user: { id: u.id, username: u.username, name: u.name, role: u.role } });
}));

router.get('/auth/me', authRequired, wrap(async (req, res) => {
  const rows = await q('SELECT id, username, name, role FROM users WHERE id = ?', [req.user.uid]);
  if (!rows.length) return fail(res, 401, 40103, '用户不存在');
  ok(res, rows[0]);
}));

// ═══════════ 场馆 ═══════════
router.get('/venues', authRequired, wrap(async (req, res) => {
  const { type } = req.query;
  const args = [];
  let sql = 'SELECT id, name, cover, type, location, capacity, open_slot, close_slot FROM venues WHERE status = 1';
  if (type) { sql += ' AND type = ?'; args.push(type); }
  sql += ' ORDER BY id';
  ok(res, await q(sql, args));
}));

// 某天某场馆的时段状态：可约 / 已约 / 待审 / 已驳回
router.get('/venues/:id/slots', authRequired, wrap(async (req, res) => {
  const venueId = Number(req.params.id);
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, 40002, '日期格式应为 YYYY-MM-DD');

  const v = await q('SELECT * FROM venues WHERE id = ? AND status = 1', [venueId]);
  if (!v.length) return fail(res, 404, 40401, '场馆不存在');

  const booked = await q(
    `SELECT slot, status FROM bookings
      WHERE venue_id = ? AND book_date = ? AND active = 1`, [venueId, date]);
  const map = new Map(booked.map(r => [r.slot, r.status]));

  const venue = v[0];
  const slots = [];
  for (let s = 1; s <= 8; s++) {
    let state = 'closed';
    if (s >= venue.open_slot && s <= venue.close_slot) {
      state = map.has(s) ? map.get(s) : 'free';
    }
    slots.push({ slot: s, text: SLOT_TEXT[s], state });
  }
  ok(res, { venue: { id: venue.id, name: venue.name, type: venue.type }, date, slots });
}));

// ═══════════ 预约 ═══════════
router.post('/bookings', authRequired, wrap(async (req, res) => {
  const { venueId, date, slot, remark = '' } = req.body || {};
  const s = Number(slot);
  if (!venueId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !(s >= 1 && s <= 8)) {
    return fail(res, 400, 40003, '参数不合法');
  }
  if (String(date) < new Date().toISOString().slice(0, 10)) {
    return fail(res, 400, 40004, '不能预约过去的日期');
  }

  try {
    const row = await tx(async (conn) => {
      // 行锁住场馆，避免并发下同时通过可用性检查
      const [v] = await conn.query('SELECT id, open_slot, close_slot FROM venues WHERE id = ? AND status = 1 FOR UPDATE', [venueId]);
      if (!v.length) throw Object.assign(new Error('场馆不存在或已停用'), { http: 404, code: 40402 });
      if (s < v[0].open_slot || s > v[0].close_slot) throw Object.assign(new Error('该时段不开放'), { http: 400, code: 40005 });

      // 同一用户同一天最多 3 个预约
      const [cnt] = await conn.query(
        `SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND book_date = ? AND active = 1`,
        [req.user.uid, date]);
      if (cnt[0].n >= 3) throw Object.assign(new Error('同一天最多预约 3 个时段'), { http: 400, code: 40006 });

      const [r] = await conn.query(
        `INSERT INTO bookings (user_id, venue_id, book_date, slot, remark) VALUES (?, ?, ?, ?, ?)`,
        [req.user.uid, venueId, date, s, String(remark).slice(0, 200)]);
      return { id: r.insertId };
    });
    const [v] = await q('SELECT name FROM venues WHERE id = ?', [venueId]);
    await notify({ template: 'booking_submitted', data: { venue: v?.name ?? '', date, slot: SLOT_TEXT[s] } });
    ok(res, { bookingId: row.id }, '预约已提交，等待审核');
  } catch (e) {
    // 唯一索引冲突：数据库层兜住了并发
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 409, 40901, '该时段刚被约走，请换一个时段');
    if (e.http) return fail(res, e.http, e.code, e.message);
    throw e;
  }
}));

router.get('/bookings/mine', authRequired, wrap(async (req, res) => {
  const rows = await q(
    `SELECT b.id, b.book_date AS date, b.slot, b.status, b.remark, b.created_at,
            v.name AS venueName, v.location
       FROM bookings b JOIN venues v ON v.id = b.venue_id
      WHERE b.user_id = ? AND b.active = 1
      ORDER BY b.book_date DESC, b.slot DESC`, [req.user.uid]);
  ok(res, rows.map(r => ({ ...r, slotText: SLOT_TEXT[r.slot] })));
}));

router.post('/bookings/:id/cancel', authRequired, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const r = await q(
    `UPDATE bookings SET status = 'cancelled'
      WHERE id = ? AND user_id = ? AND status IN ('pending','approved')`,
    [id, req.user.uid]);
  if (!r.affectedRows) return fail(res, 404, 40403, '预约不存在或已不可取消');
  ok(res, null, '已取消');
}));

// ═══════════ 管理端 ═══════════
router.get('/admin/bookings', authRequired, adminRequired, wrap(async (req, res) => {
  const status = req.query.status || 'pending';
  const page = Math.max(1, Number(req.query.page || 1));
  const size = Math.min(50, Math.max(1, Number(req.query.size || 10)));
  const offset = (page - 1) * size;

  const total = (await q('SELECT COUNT(*) AS n FROM bookings WHERE status = ?', [status]))[0].n;
  const rows = await q(
    `SELECT b.id, b.book_date AS date, b.slot, b.status, b.remark, b.created_at,
            u.name AS userName, v.name AS venueName
       FROM bookings b
       JOIN users u  ON u.id = b.user_id
       JOIN venues v ON v.id = b.venue_id
      WHERE b.status = ?
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?`, [status, size, offset]);

  ok(res, { total, page, size, list: rows.map(r => ({ ...r, slotText: SLOT_TEXT[r.slot] })) });
}));

router.post('/admin/bookings/:id/review', authRequired, adminRequired, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const action = String(req.body?.action || '');
  if (!['approve', 'reject'].includes(action)) return fail(res, 400, 40007, 'action 只能是 approve 或 reject');

  const next = action === 'approve' ? 'approved' : 'rejected';
  const r = await q(
    `UPDATE bookings SET status = ? WHERE id = ? AND status = 'pending'`, [next, id]);
  if (!r.affectedRows) return fail(res, 409, 40902, '该预约已被处理');
  ok(res, null, next === 'approved' ? '已通过' : '已驳回');
}));

// ═══════════ 健康检查 ═══════════
router.get('/health', wrap(async (_req, res) => {
  const v = await q('SELECT 1 AS ok');
  ok(res, { db: v[0].ok === 1, ts: Date.now() });
}));
