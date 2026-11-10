-- 001_init.sql —— 初始结构
-- 迁移规则：只追加，不修改历史文件

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(32)  NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  name          VARCHAR(32)  NOT NULL,
  role          ENUM('student','admin') NOT NULL DEFAULT 'student',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS venues (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(64)  NOT NULL,
  type        VARCHAR(16)  NOT NULL,
  location    VARCHAR(64)  NOT NULL,
  capacity    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  open_slot   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  close_slot  TINYINT UNSIGNED NOT NULL DEFAULT 8,
  status      TINYINT NOT NULL DEFAULT 1,
  KEY idx_type_status (type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bookings (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  venue_id   INT UNSIGNED NOT NULL,
  book_date  DATE NOT NULL,
  slot       TINYINT UNSIGNED NOT NULL,
  status     ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  remark     VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  active TINYINT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN status IN ('pending','approved') THEN 1 ELSE NULL END) STORED,
  UNIQUE KEY uk_slot_active (venue_id, book_date, slot, active),
  KEY idx_user_date (user_id, book_date),
  KEY idx_status_date (status, book_date),
  CONSTRAINT fk_bk_user  FOREIGN KEY (user_id)  REFERENCES users(id),
  CONSTRAINT fk_bk_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
