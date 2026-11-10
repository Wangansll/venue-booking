-- ⚠⚠⚠ 危险操作 ⚠⚠⚠
-- 这会【删除整个数据库】并重建空库。所有数据不可恢复。
--
-- 只在以下情况使用：
--   1. 本地开发环境，确认没有要保留的数据
--   2. 已经做过备份（tools/backup.ps1）
--
-- 执行前请先确认：
--   mysql -u root -p -e "SELECT COUNT(*) FROM venue_booking.bookings;"
--
-- 用法：
--   mysql -u root -p < db/danger/reset.sql
--   然后必须重跑迁移：cd server && node src/migrate.js && node src/seed.js

DROP DATABASE IF EXISTS venue_booking;
CREATE DATABASE venue_booking DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
