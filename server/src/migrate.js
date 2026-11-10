/**
 * 迁移运行器：按文件名排序执行 db/migrations/*.sql，
 * 已执行的记录在 schema_migrations 表里，可重复运行。
 * 用法: node src/migrate.js
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import config from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../db/migrations');

function log(msg) { process.stdout.write(`[migrate] ${msg}\n`); }

const conn = await mysql.createConnection({
  host: config.db.host, port: config.db.port,
  user: config.db.user, password: config.db.password,
  database: config.db.database,     // 不选库会报 No database selected
  multipleStatements: true,
});

await conn.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       VARCHAR(128) PRIMARY KEY,
    checksum   CHAR(64) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);

const files = (await fs.readdir(DIR)).filter(f => f.endsWith('.sql')).sort();
const [done] = await conn.query('SELECT name, checksum FROM schema_migrations');
const applied = new Map(done.map(r => [r.name, r.checksum]));

let ran = 0;
for (const f of files) {
  const sql = await fs.readFile(path.join(DIR, f), 'utf8');
  const sum = crypto.createHash('sha256').update(sql).digest('hex');
  const prev = applied.get(f);

  if (prev) {
    if (prev !== sum) {
      log(`✗ ${f} 内容已变更但已执行，请新增迁移文件而不是改历史`);
      process.exitCode = 1;
      break;
    }
    log(`· ${f} 已执行，跳过`);
    continue;
  }

  log(`→ 执行 ${f}`);
  await conn.query(sql);
  await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [f, sum]);
  ran += 1;
}

log(ran ? `完成，本次执行 ${ran} 个迁移` : '完成，无待执行迁移');
await conn.end();
