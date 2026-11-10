import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/lib.js';

const app = createApp();
let studentToken = '';
let adminToken = '';
const DATE = '2030-06-01';

beforeAll(async () => {
  const s = await request(app).post('/api/auth/login').send({ username: 'student', password: '123456' });
  studentToken = s.body.data?.token;
  const a = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  adminToken = a.body.data?.token;
  await pool.query('DELETE FROM bookings WHERE book_date = ?', [DATE]);
});

afterAll(async () => {
  await pool.query('DELETE FROM bookings WHERE book_date = ?', [DATE]);
  await pool.end();
});

describe('健康检查', () => {
  it('返回 db:true 和请求 ID', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.data.db).toBe(true);
    expect(r.headers['x-request-id']).toBeTruthy();
  });
});

describe('登录', () => {
  it('密码错误返回 401 + 40102', async () => {
    const r = await request(app).post('/api/auth/login').send({ username: 'student', password: 'wrong' });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe(40102);
  });

  it('缺参数返回 400', async () => {
    const r = await request(app).post('/api/auth/login').send({});
    expect(r.status).toBe(400);
  });
});

describe('权限', () => {
  it('未登录访问业务接口 401', async () => {
    const r = await request(app).get('/api/bookings/mine');
    expect(r.status).toBe(401);
  });

  it('学生访问管理端 403', async () => {
    const r = await request(app).get('/api/admin/bookings').set('Authorization', `Bearer ${studentToken}`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe(40300);
  });
});

describe('预约与防重', () => {
  it('首次预约成功', async () => {
    const r = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ venueId: 1, date: DATE, slot: 6 });
    expect(r.status).toBe(200);
    expect(r.body.data.bookingId).toBeGreaterThan(0);
  });

  it('同一时段重复预约返回 409', async () => {
    const r = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ venueId: 1, date: DATE, slot: 6 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe(40901);
  });
});

describe('内容发布流程', () => {
  let id = 0;

  it('创建为草稿，前台查不到', async () => {
    const c = await request(app).post('/api/admin/articles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'news', title: '测试草稿', summary: 's' });
    id = c.body.data.id;
    expect(c.status).toBe(200);

    const list = await request(app).get('/api/articles?type=news&size=30');
    expect(list.body.data.list.some((a) => a.id === id)).toBe(false);
  });

  it('发布后前台可见', async () => {
    await request(app).post(`/api/admin/articles/${id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`).send({});
    const detail = await request(app).get(`/api/articles/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.title).toBe('测试草稿');
  });

  it('转回草稿后前台 404', async () => {
    await request(app).post(`/api/admin/articles/${id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`).send({ publish: false });
    const detail = await request(app).get(`/api/articles/${id}`);
    expect(detail.status).toBe(404);
  });

  it('清理', async () => {
    const r = await request(app).delete(`/api/admin/articles/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
  });
});

describe('留言', () => {
  it('提交留言成功', async () => {
    const r = await request(app).post('/api/messages')
      .send({ name: '测试', phone: '13800138000', content: '测试留言' });
    expect(r.status).toBe(200);
  });

  it('缺字段返回 400', async () => {
    const r = await request(app).post('/api/messages').send({ name: 'x' });
    expect(r.status).toBe(400);
  });
});
