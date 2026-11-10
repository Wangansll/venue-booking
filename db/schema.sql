-- ============================================================
--  校园场馆预约系统 · 数据库
--  要点：
--    1. 预约的并发防重 —— 用「生成列 + 唯一索引」而不是前端判重
--    2. 取消后能重新预约 —— 生成列为 NULL 时不影响唯一性（MySQL 允许多个 NULL）
--    3. 查询走联合索引最左前缀
-- ============================================================

-- 安全版：只建库建表，不删任何已有数据。
-- 需要「清空重建」请用 db/danger/reset.sql（那里有二次确认提示）。
CREATE DATABASE IF NOT EXISTS venue_booking DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE venue_booking;

-- ── 用户 ──────────────────────────────────────────────
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(32)  NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  name          VARCHAR(32)  NOT NULL,
  role          ENUM('student','admin') NOT NULL DEFAULT 'student',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB;

-- ── 场馆 ──────────────────────────────────────────────
CREATE TABLE venues (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(64)  NOT NULL,
  type        VARCHAR(16)  NOT NULL,          -- 篮球场 / 羽毛球 / 自习室
  location    VARCHAR(64)  NOT NULL,
  capacity    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  open_slot   TINYINT UNSIGNED NOT NULL DEFAULT 1,   -- 可约时段起
  close_slot  TINYINT UNSIGNED NOT NULL DEFAULT 8,   -- 可约时段止
  status      TINYINT NOT NULL DEFAULT 1,     -- 1 开放 / 0 停用
  KEY idx_type_status (type, status)
) ENGINE=InnoDB;

-- ── 预约 ──────────────────────────────────────────────
--  slot：一天切 8 段（1=08:00-10:00 … 8=22:00-24:00）
--  active：只有 pending / approved 才算「占位」，取消和驳回置 NULL
CREATE TABLE bookings (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  venue_id   INT UNSIGNED NOT NULL,
  book_date  DATE NOT NULL,
  slot       TINYINT UNSIGNED NOT NULL,
  status     ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  remark     VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- 生成列：占位中 = 1，已释放 = NULL
  active TINYINT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN status IN ('pending','approved') THEN 1 ELSE NULL END) STORED,

  -- 核心约束：同一场馆 + 同一天 + 同一时段，只能有一条「占位中」的记录
  UNIQUE KEY uk_slot_active (venue_id, book_date, slot, active),

  -- 列表查询走这条（最左前缀 user_id）
  KEY idx_user_date (user_id, book_date),
  KEY idx_status_date (status, book_date),

  CONSTRAINT fk_bk_user  FOREIGN KEY (user_id)  REFERENCES users(id),
  CONSTRAINT fk_bk_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
) ENGINE=InnoDB;

-- ── 种子数据 ──────────────────────────────────────────
-- 密码由 server/src/seed.js 写入（scrypt），这里只建场馆
INSERT INTO venues (name, type, location, capacity, open_slot, close_slot) VALUES
  ('东区篮球场', '篮球场', '东区体育馆 1F', 20, 1, 8),
  ('西区羽毛球馆', '羽毛球', '西区体育馆 2F', 12, 2, 7),
  ('图书馆自习室 A', '自习室', '图书馆 3F', 40, 1, 8),
  ('南区网球场', '网球场', '南区运动场', 8, 2, 6);

SELECT '建库完成' AS msg, COUNT(*) AS venues FROM venues;
