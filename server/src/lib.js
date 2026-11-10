import 'dotenv/config';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// ───────── 数据库连接池 ─────────
export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'root',
  database: process.env.DB_NAME || 'venue_booking',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: ['DATE'],          // 日期不要被转成 Date 对象，避免时区偏移
});

export async function q(sql, args = []) {
  const [rows] = await pool.query(sql, args);
  return rows;
}

// 事务封装：回调里抛错自动回滚
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ───────── 密码：内置 scrypt，不引 bcrypt ─────────
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(plain, salt, 32);
  const expect = Buffer.from(hash, 'hex');
  return test.length === expect.length && crypto.timingSafeEqual(test, expect);
}

// ───────── JWT ─────────
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '7d' });
}

export function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ code: 40100, msg: '未登录' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ code: 40101, msg: '登录已失效，请重新登录' });
  }
}

export function adminRequired(req, res, next) {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'viewer') {
      return res.status(403).json({ code: 40300, msg: '无权限' });
    }
    // viewer = 公开演示用的只读后台：能看数据，不能改
    if (role === 'viewer' && req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(403).json({ code: 40301, msg: '演示账号只读，不能修改数据' });
    }
    next();
  }

// ───────── 统一响应 ─────────
export const ok = (res, data = null, msg = 'ok') => res.json({ code: 0, msg, data });
export const fail = (res, status, code, msg) => res.status(status).json({ code, msg });

// 异步路由包装：省掉每个 handler 的 try/catch
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ───────── 时段 ─────────
export const SLOT_TEXT = [
  '', '08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00',
  '16:00-18:00', '18:00-20:00', '20:00-22:00', '22:00-24:00',
];
