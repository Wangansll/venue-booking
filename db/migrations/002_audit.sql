-- 002_audit.sql —— 审核留痕：谁、何时、把状态从什么改成了什么
CREATE TABLE IF NOT EXISTS booking_audit (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  actor_id   INT UNSIGNED NOT NULL,
  from_status VARCHAR(16) NOT NULL,
  to_status   VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_booking (booking_id),
  KEY idx_actor_created (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
