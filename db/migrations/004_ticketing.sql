-- 004_ticketing.sql —— 票务：分区 / 座位 / 场次 / 票档 / 锁座 / 订单 / 出票
CREATE TABLE IF NOT EXISTS venue_areas (
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(32) NOT NULL,
  color  VARCHAR(16) NOT NULL DEFAULT '#3b6ef5',
  row_count TINYINT UNSIGNED NOT NULL DEFAULT 8,
  col_count TINYINT UNSIGNED NOT NULL DEFAULT 12
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seats (
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  area_id INT UNSIGNED NOT NULL,
  row_no  TINYINT UNSIGNED NOT NULL,
  seat_no TINYINT UNSIGNED NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY uk_area_seat (area_id, row_no, seat_no),
  CONSTRAINT fk_seat_area FOREIGN KEY (area_id) REFERENCES venue_areas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_sessions (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title     VARCHAR(120) NOT NULL,
  cover     VARCHAR(255) NULL,
  start_at  DATETIME NOT NULL,
  hall      VARCHAR(64) NOT NULL,
  status    ENUM('on_sale','sold_out','finished','cancelled') NOT NULL DEFAULT 'on_sale',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_start (start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  area_id    INT UNSIGNED NOT NULL,
  name       VARCHAR(32) NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  KEY idx_session (session_id),
  CONSTRAINT fk_tier_session FOREIGN KEY (session_id) REFERENCES event_sessions(id),
  CONSTRAINT fk_tier_area    FOREIGN KEY (area_id)    REFERENCES venue_areas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 锁座：唯一索引即库存，两个人抢同一座，第二条 INSERT 直接失败
CREATE TABLE IF NOT EXISTS seat_locks (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  seat_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  expire_at  DATETIME NOT NULL,
  UNIQUE KEY uk_seat_session (seat_id, session_id),
  KEY idx_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no     CHAR(20) NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  session_id   INT UNSIGNED NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  status       ENUM('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
  pay_channel  VARCHAR(16) NULL,
  paid_at      DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    BIGINT UNSIGNED NOT NULL,
  seat_id     INT UNSIGNED NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  KEY idx_order (order_id),
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tickets (
  id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  seat_id  INT UNSIGNED NOT NULL,
  code     CHAR(12) NOT NULL,
  status   ENUM('valid','used','refunded') NOT NULL DEFAULT 'valid',
  used_at  DATETIME NULL,
  UNIQUE KEY uk_code (code),
  KEY idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
