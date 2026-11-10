import { Router } from 'express';
import { q } from './lib.js';
import { authRequired, adminRequired, ok, fail, wrap } from './lib.js';
import { AppError } from './errors.js';

export const contentRouter = Router();

// ═══════════ 公开：内容（新闻 / 活动）═══════════
contentRouter.get('/articles', wrap(async (req, res) => {
  const type = req.query.type === 'event' ? 'event' : 'news';
  const page = Math.max(1, Number(req.query.page || 1));
  const size = Math.min(30, Math.max(1, Number(req.query.size || 6)));
  const off = (page - 1) * size;

  const total = (await q(
    `SELECT COUNT(*) AS n FROM articles WHERE type = ? AND status = 'published'`, [type]))[0].n;

  const list = await q(
    `SELECT id, type, title, cover, summary, published_at AS publishedAt,
            event_start AS eventStart, event_end AS eventEnd, event_place AS eventPlace
       FROM articles
      WHERE type = ? AND status = 'published'
      ORDER BY published_at DESC, id DESC
      LIMIT ? OFFSET ?`, [type, size, off]);

  ok(res, { total, page, size, list });
}));

contentRouter.get('/articles/:id', wrap(async (req, res) => {
  const rows = await q(
    `SELECT id, type, title, cover, summary, content, published_at AS publishedAt,
            event_start AS eventStart, event_end AS eventEnd, event_place AS eventPlace
       FROM articles WHERE id = ? AND status = 'published'`, [Number(req.params.id)]);
  if (!rows.length) return fail(res, 404, 40401, '内容不存在');
  ok(res, rows[0]);
}));

// ═══════════ 公开：首页聚合 ═══════════
contentRouter.get('/home', wrap(async (_req, res) => {
  const [banners, venues, events, news] = await Promise.all([
    q(`SELECT id, title, subtitle, image, link FROM banners WHERE enabled = 1 ORDER BY sort, id`),
    q(`SELECT id, name, cover, type, location, capacity, open_slot, close_slot FROM venues WHERE status = 1 ORDER BY id LIMIT 4`),
    q(`SELECT id, title, cover, summary, event_start AS eventStart, event_place AS eventPlace
         FROM articles WHERE type='event' AND status='published' ORDER BY published_at DESC LIMIT 3`),
    q(`SELECT id, title, cover, summary, published_at AS publishedAt
         FROM articles WHERE type='news' AND status='published' ORDER BY published_at DESC LIMIT 3`),
  ]);
  // 首页数字：全部来自数据库，不用硬编码
  const [[bookings], [seats], [openVenues], [published]] = await Promise.all([
    q(`SELECT COUNT(*) AS n FROM bookings WHERE book_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`),
    q(`SELECT COUNT(*) AS n FROM seats WHERE enabled = 1`),
    q(`SELECT COUNT(*) AS n FROM venues WHERE status = 1`),
    q(`SELECT COUNT(*) AS n FROM articles WHERE status = 'published'`),
  ]);

  ok(res, {
    banners, venues, events, news,
    stats: [
      { value: String(openVenues.n), unit: '座', label: '在运营场馆' },
      { value: String(seats.n), unit: '个', label: '可约座位 / 场' },
      { value: String(bookings.n), unit: '次', label: '近 30 天预约' },
      { value: String(published.n), unit: '篇', label: '已发布内容' },
    ],
  });
}));

// ═══════════ 公开：留言 ═══════════
contentRouter.post('/messages', wrap(async (req, res) => {
  const { name, phone, email = '', content } = req.body || {};
  if (!name || !phone || !content) throw new AppError(40000, '姓名、电话、留言内容都不能为空');
  if (String(phone).replace(/\D/g, '').length < 7) throw new AppError(40000, '电话格式不正确');
  if (String(content).length > 1000) throw new AppError(40000, '留言内容不能超过 1000 字');

  await q(
    `INSERT INTO contact_messages (name, phone, email, content) VALUES (?, ?, ?, ?)`,
    [String(name).slice(0, 32), String(phone).slice(0, 20), String(email).slice(0, 64), String(content)]);
  ok(res, null, '留言已提交，我们会尽快联系你');
}));

// ═══════════ 后台：内容管理 ═══════════
contentRouter.get('/admin/articles', authRequired, adminRequired, wrap(async (req, res) => {
  const type = req.query.type === 'event' ? 'event' : 'news';
  const status = ['draft', 'published'].includes(req.query.status) ? req.query.status : null;
  const page = Math.max(1, Number(req.query.page || 1));
  const size = Math.min(50, Math.max(1, Number(req.query.size || 10)));
  const off = (page - 1) * size;

  const where = ['a.type = ?'];
  const args = [type];
  if (status) { where.push('a.status = ?'); args.push(status); }
  const w = where.join(' AND ');

  const total = (await q(`SELECT COUNT(*) AS n FROM articles a WHERE ${w}`, args))[0].n;
  const list = await q(
    `SELECT a.id, a.type, a.title, a.status, a.cover, a.summary,
            a.published_at AS publishedAt, a.updated_at AS updatedAt, u.name AS author
       FROM articles a LEFT JOIN users u ON u.id = a.author_id
      WHERE ${w} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`, [...args, size, off]);

  ok(res, { total, page, size, list });
}));

contentRouter.post('/admin/articles', authRequired, adminRequired, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.title) throw new AppError(40000, '标题不能为空');
  const type = b.type === 'event' ? 'event' : 'news';
  const r = await q(
    `INSERT INTO articles (type, title, cover, summary, content, status, event_start, event_end, event_place, author_id)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    [type, String(b.title).slice(0, 120), b.cover || null, b.summary || null, b.content || null,
     b.eventStart || null, b.eventEnd || null, b.eventPlace || null, req.user.uid]);
  ok(res, { id: r.insertId }, '已保存为草稿');
}));

contentRouter.put('/admin/articles/:id', authRequired, adminRequired, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const r = await q(
    `UPDATE articles SET title = ?, cover = ?, summary = ?, content = ?,
            event_start = ?, event_end = ?, event_place = ? WHERE id = ?`,
    [String(b.title || '').slice(0, 120), b.cover || null, b.summary || null, b.content || null,
     b.eventStart || null, b.eventEnd || null, b.eventPlace || null, id]);
  if (!r.affectedRows) return fail(res, 404, 40401, '内容不存在');
  ok(res, null, '已保存');
}));

contentRouter.post('/admin/articles/:id/publish', authRequired, adminRequired, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const to = req.body?.publish === false ? 'draft' : 'published';
  const r = await q(
    `UPDATE articles SET status = ?, published_at = ${to === 'published' ? 'NOW()' : 'NULL'} WHERE id = ?`,
    [to, id]);
  if (!r.affectedRows) return fail(res, 404, 40401, '内容不存在');
  ok(res, null, to === 'published' ? '已发布' : '已转为草稿');
}));

contentRouter.delete('/admin/articles/:id', authRequired, adminRequired, wrap(async (req, res) => {
  const r = await q('DELETE FROM articles WHERE id = ?', [Number(req.params.id)]);
  if (!r.affectedRows) return fail(res, 404, 40401, '内容不存在');
  ok(res, null, '已删除');
}));

// ═══════════ 后台：留言 ═══════════
contentRouter.get('/admin/messages', authRequired, adminRequired, wrap(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const size = Math.min(50, Math.max(1, Number(req.query.size || 10)));
  const off = (page - 1) * size;
  const total = (await q('SELECT COUNT(*) AS n FROM contact_messages'))[0].n;
  const unread = (await q('SELECT COUNT(*) AS n FROM contact_messages WHERE is_read = 0'))[0].n;
  const list = await q(
    `SELECT id, name, phone, email, content, is_read AS isRead, created_at AS createdAt
       FROM contact_messages ORDER BY created_at DESC LIMIT ? OFFSET ?`, [size, off]);
  ok(res, { total, unread, page, size, list });
}));

contentRouter.post('/admin/messages/:id/read', authRequired, adminRequired, wrap(async (req, res) => {
  await q('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [Number(req.params.id)]);
  ok(res, null, '已标记已读');
}));

// ═══════════ 后台：概览 ═══════════
contentRouter.get('/admin/dashboard', authRequired, adminRequired, wrap(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [todayCnt] = await q(
    `SELECT COUNT(*) AS n FROM bookings WHERE book_date = ? AND active = 1`, [today]);
  const [pending] = await q(`SELECT COUNT(*) AS n FROM bookings WHERE status = 'pending'`);
  const [venues] = await q(`SELECT COUNT(*) AS n FROM venues WHERE status = 1`);
  const [unread] = await q(`SELECT COUNT(*) AS n FROM contact_messages WHERE is_read = 0`);
  const [articles] = await q(`SELECT COUNT(*) AS n FROM articles WHERE status = 'published'`);

  // 票房：老板打开后台第一屏要能看到钱
  const [revenue] = await q(
    `SELECT CAST(COALESCE(SUM(amount_cents),0) AS UNSIGNED) AS cents,
            COUNT(*) AS orders
       FROM orders WHERE status = 'paid'`);
  const [soldSeats] = await q(
    `SELECT COUNT(*) AS n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='paid'`);
  const [redeemed] = await q(`SELECT COUNT(*) AS n FROM tickets WHERE status='used'`);

  const recent = await q(
    `SELECT b.id, b.book_date AS date, b.slot, b.status, u.name AS userName, v.name AS venueName
       FROM bookings b JOIN users u ON u.id=b.user_id JOIN venues v ON v.id=b.venue_id
      ORDER BY b.created_at DESC LIMIT 6`);

  ok(res, {
    todayBookings: todayCnt.n, pending: pending.n, venues: venues.n,
    unreadMessages: unread.n, published: articles.n,
    revenueCents: revenue.cents, paidOrders: revenue.orders,
    soldSeats: soldSeats.n, redeemed: redeemed.n,
    recent,
  });
}));
