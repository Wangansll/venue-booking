import 'dotenv/config';
import { q, hashPassword } from './lib.js';

// 初始化账号：admin / admin123   student / 123456
const USERS = [
  { username: 'demo', password: 'demo123', name: '演示账号', role: 'viewer' },
  { username: 'admin',   password: 'admin123', name: '张老师', role: 'admin' },
  { username: 'student', password: '123456',  name: '王安顺', role: 'student' },
];

const run = async () => {
  for (const u of USERS) {
    await q(
      `INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name), role = VALUES(role)`,
      [u.username, hashPassword(u.password), u.name, u.role],
    );
    console.log(`✓ ${u.role.padEnd(8)} ${u.username} / ${u.password}`);
  }
  console.log('\n种子完成。');
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
