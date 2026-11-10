-- 009_viewer_role.sql —— 公开演示用的只读后台账号
ALTER TABLE users MODIFY COLUMN role ENUM('student','admin','viewer') NOT NULL DEFAULT 'student';
