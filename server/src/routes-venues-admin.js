import { Router } from 'express';
import { q, authRequired, adminRequired, ok, fail, wrap } from './lib.js';
import { AppError } from './errors.js';

export const venueAdminRouter = Router();

venueAdminRouter.post('/admin/venues', authRequired, adminRequired, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.type || !b.location) throw new AppError(40000, '名称、类型、位置不能为空');
  const open = Number(b.open_slot ?? 1), close = Number(b.close_slot ?? 8);
  if (open < 1 || close > 8 || open > close) throw new AppError(40000, '时段范围不合法（1~8）');

  const r = await q(
    `INSERT INTO venues (name, type, location, capacity, open_slot, close_slot, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [String(b.name).slice(0, 64), String(b.type).slice(0, 16), String(b.location).slice(0, 64),
     Math.max(1, Number(b.capacity ?? 1)), open, close, b.status ? 1 : 0]);
  ok(res, { id: r.insertId }, '场馆已创建');
}));

venueAdminRouter.put('/admin/venues/:id', authRequired, adminRequired, wrap(async (req, res) => {
  const b = req.body || {};
  const r = await q(
    `UPDATE venues SET name = ?, type = ?, location = ?, capacity = ?,
            open_slot = ?, close_slot = ?, status = ? WHERE id = ?`,
    [String(b.name || '').slice(0, 64), String(b.type || '').slice(0, 16), String(b.location || '').slice(0, 64),
     Math.max(1, Number(b.capacity ?? 1)), Number(b.open_slot ?? 1), Number(b.close_slot ?? 8),
     b.status ? 1 : 0, Number(req.params.id)]);
  if (!r.affectedRows) return fail(res, 404, 40401, '场馆不存在');
  ok(res, null, '已保存');
}));

venueAdminRouter.delete('/admin/venues/:id', authRequired, adminRequired, wrap(async (req, res) => {
  // 有预约记录不物理删除，改为下架
  const [used] = await q('SELECT COUNT(*) AS n FROM bookings WHERE venue_id = ?', [Number(req.params.id)]);
  if (used.n > 0) {
    await q('UPDATE venues SET status = 0 WHERE id = ?', [Number(req.params.id)]);
    return ok(res, null, '该场馆已有预约记录，已改为下架');
  }
  await q('DELETE FROM venues WHERE id = ?', [Number(req.params.id)]);
  ok(res, null, '已删除');
}));
