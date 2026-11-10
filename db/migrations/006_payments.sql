-- 006_payments.sql —— 支付流水，用于对账
CREATE TABLE IF NOT EXISTS payments (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT UNSIGNED NOT NULL,
  order_no       CHAR(20) NOT NULL,
  channel        VARCHAR(16) NOT NULL,
  out_trade_no   VARCHAR(64) NULL,          -- 渠道商户订单号
  transaction_id VARCHAR(64) NULL,          -- 渠道交易号
  amount_cents   INT UNSIGNED NOT NULL,
  status         ENUM('success','refunded','failed') NOT NULL DEFAULT 'success',
  source         ENUM('mock_pay','notify','refund') NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order (order_id),
  KEY idx_created (created_at),
  UNIQUE KEY uk_channel_tx (channel, transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
