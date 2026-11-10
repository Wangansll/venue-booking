-- 003_content.sql —— 新闻/活动统一内容模型 + 留言 + 轮播
CREATE TABLE IF NOT EXISTS articles (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type        ENUM('news','event') NOT NULL DEFAULT 'news',
  title       VARCHAR(120) NOT NULL,
  cover       VARCHAR(255) NULL,
  summary     VARCHAR(300) NULL,
  content     MEDIUMTEXT NULL,
  status      ENUM('draft','published') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  author_id   INT UNSIGNED NULL,
  event_start DATETIME NULL,
  event_end   DATETIME NULL,
  event_place VARCHAR(120) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_type_status_pub (type, status, published_at),
  CONSTRAINT fk_art_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(32) NOT NULL,
  phone      VARCHAR(20) NOT NULL,
  email      VARCHAR(64) NULL,
  content    VARCHAR(1000) NOT NULL,
  is_read    TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_read_created (is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS banners (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title    VARCHAR(80) NOT NULL,
  subtitle VARCHAR(160) NULL,
  image    VARCHAR(255) NOT NULL,
  link     VARCHAR(255) NULL,
  sort     INT NOT NULL DEFAULT 0,
  enabled  TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
