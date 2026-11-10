/** 演示数据：一个场馆分区 + 座位 + 一场演出 + 票档 */
import 'dotenv/config';
import { q } from './lib.js';

const AREAS = [
  { name: 'A 区内场', color: '#3b6ef5', rowCount: 6, colCount: 10, price: 28000 },
  { name: 'B 区看台', color: '#8b5cf6', rowCount: 6, colCount: 10, price: 18000 },
  { name: 'C 区看台', color: '#0f9d58', rowCount: 6, colCount: 10, price: 8000 },
];

const run = async () => {
  // 清空票务数据（演示用，可重复执行）
  await q('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['tickets', 'order_items', 'orders', 'seat_locks', 'ticket_tiers', 'seats', 'venue_areas', 'event_sessions']) {
    await q(`TRUNCATE TABLE ${t}`);
  }
  await q('SET FOREIGN_KEY_CHECKS = 1');

  const areaIds = [];
  for (const a of AREAS) {
    const r = await q('INSERT INTO venue_areas (name, color, row_count, col_count) VALUES (?, ?, ?, ?)',
      [a.name, a.color, a.rowCount, a.colCount]);
    const areaId = r.insertId;
    areaIds.push({ id: areaId, ...a });

    const values = [];
    const args = [];
    for (let r0 = 1; r0 <= a.rowCount; r0++) {
      for (let c0 = 1; c0 <= a.colCount; c0++) {
        values.push('(?, ?, ?, 1)');
        args.push(areaId, r0, c0);
      }
    }
    await q(`INSERT INTO seats (area_id, row_no, seat_no, enabled) VALUES ${values.join(',')}`, args);
  }

  const sessions = [
    { title: '校园音乐节 · 夏夜专场', cover: '/img/real/event2.jpg', start: '2026-12-20 19:30:00', hall: '东区体育馆主馆' },
    { title: '篮球全明星赛', cover: '/img/real/court1.jpg', start: '2026-12-28 15:00:00', hall: '东区体育馆主馆' },
  ];

  for (const s of sessions) {
    const r = await q('INSERT INTO event_sessions (title, cover, start_at, hall) VALUES (?, ?, ?, ?)',
      [s.title, s.cover, s.start, s.hall]);
    const sid = r.insertId;
    for (const a of areaIds) {
      await q('INSERT INTO ticket_tiers (session_id, area_id, name, price_cents) VALUES (?, ?, ?, ?)',
        [sid, a.id, a.name, a.price]);
    }
  }

  const [{ n: seatCount }] = await q('SELECT COUNT(*) AS n FROM seats');
  const [{ n: sessionCount }] = await q('SELECT COUNT(*) AS n FROM event_sessions');
  console.log(`✓ 分区 ${AREAS.length} 个，座位 ${seatCount} 个，场次 ${sessionCount} 场`);
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
