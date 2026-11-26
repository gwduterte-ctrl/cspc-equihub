CREATE DATABASE IF NOT EXISTS cspc_hiramhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cspc_hiramhub;

CREATE TABLE IF NOT EXISTS departments (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20)  NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  logo VARCHAR(160) NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT          NOT NULL,
  name          VARCHAR(80)  NOT NULL,
  image         VARCHAR(160) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cat_dept_name (department_id, name),
  CONSTRAINT fk_cat_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS equipment (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  category_id   INT           NOT NULL,
  name          VARCHAR(120)  NOT NULL,
  description   VARCHAR(500)  NOT NULL DEFAULT '',
  image         VARCHAR(160)  NULL,
  total_qty     INT UNSIGNED  NOT NULL DEFAULT 1,
  available_qty INT UNSIGNED  NOT NULL DEFAULT 1,
  status        ENUM('available','maintenance','unavailable') NOT NULL DEFAULT 'available',
  featured      TINYINT(1)    NOT NULL DEFAULT 0,   -- shown first on the homepage
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_qty CHECK (available_qty <= total_qty),
  CONSTRAINT fk_eq_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  INDEX idx_eq_cat_status (category_id, status),
  FULLTEXT KEY ft_eq (name, description)
);

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,           -- NULL for Google-only accounts
  google_id     VARCHAR(64)  NULL UNIQUE,
  email_verified TINYINT(1)  NOT NULL DEFAULT 0,
  verify_token  CHAR(64)     NULL,           -- sha256 of the e-mailed token
  verify_expires DATETIME    NULL,
  user_type     ENUM('student','faculty','employee') NOT NULL DEFAULT 'student',
  id_number     VARCHAR(30)  NULL,
  department_id INT          NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  is_blocked    TINYINT(1)   NOT NULL DEFAULT 0,
  block_reason  VARCHAR(255) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS borrow_requests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  reference_no VARCHAR(24) NOT NULL UNIQUE,
  user_id      INT NOT NULL,
  equipment_id INT NOT NULL,
  quantity     INT UNSIGNED NOT NULL DEFAULT 1,
  borrow_date  DATE NOT NULL,
  return_date  DATE NOT NULL,
  purpose      VARCHAR(255) NOT NULL,
  status       ENUM('pending','approved','return_submitted','returned','rejected','cancelled') NOT NULL DEFAULT 'pending',
  admin_note   VARCHAR(255) NULL,
  return_proof VARCHAR(160) NULL,
  returned_at  DATETIME NULL,
  last_reminder_at DATE NULL,                 -- last overdue reminder (max one per day)
  reminder_count   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_br_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_br_eq   FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
  INDEX idx_br_user_status (user_id, status),
  INDEX idx_br_status (status)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  message    VARCHAR(255) NOT NULL,
  link       VARCHAR(160) NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_n_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_n_user_read (user_id, is_read)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  actor_role ENUM('user','admin','guest') NOT NULL DEFAULT 'guest',
  action     VARCHAR(60)  NOT NULL,
  details    VARCHAR(255) NULL,
  ip         VARCHAR(45)  NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_log_user (user_id),
  INDEX idx_log_created (created_at)
);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key   VARCHAR(40)  NOT NULL PRIMARY KEY,
  setting_value VARCHAR(600) NOT NULL
);

INSERT IGNORE INTO departments (code, name) VALUES
 ('CCS',  'College of Computer Studies'),
 ('CEA',  'College of Engineering and Architecture'),
 ('CAS',  'College of Arts and Sciences'),
 ('CBPA', 'College of Business and Public Administration'),
 ('CTE',  'College of Teacher Education'),
 ('GEN',  'General / Campus-wide');
