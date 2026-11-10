-- 005_reminder.sql —— 开场提醒调度用
ALTER TABLE orders ADD COLUMN reminded_at DATETIME NULL;
ALTER TABLE orders ADD KEY idx_remind (reminded_at);
