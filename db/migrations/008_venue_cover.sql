-- 008_venue_cover.sql
-- 补齐 venues.cover：这是早期手动加的列，之前没进迁移脚本，
-- 导致任何「从零建库」的环境都缺这一列（封面图无法保存）。
-- 用 information_schema 守卫，已有该列的环境执行时自动跳过。
SET @has_cover := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'venues' AND COLUMN_NAME = 'cover'
);
SET @ddl := IF(@has_cover = 0,
  'ALTER TABLE venues ADD COLUMN cover VARCHAR(255) NULL AFTER name',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
