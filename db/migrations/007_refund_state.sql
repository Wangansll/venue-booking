-- 007_refund_state.sql —— 退款中间态：先占位再打款，避免「钱出去了 DB 没记」
ALTER TABLE orders MODIFY COLUMN status
  ENUM('pending','paid','refunding','cancelled','refunded') NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN refund_error VARCHAR(200) NULL AFTER paid_at;
