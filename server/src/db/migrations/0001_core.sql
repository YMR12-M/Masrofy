-- ═══════════════════════════════════════════════════════════════
--  0001 — النواة: الأسر والأفراد والجلسات والتدقيق
--
--  المبالغ كلها BIGINT بأصغر وحدة (قروش). النِّسَب basis points (8000 = 80%).
--  التواريخ التقويمية DATE بلا منطقة زمنية، واللحظات TIMESTAMP (UTC).
-- ═══════════════════════════════════════════════════════════════

-- الأسرة = وحدة عزل البيانات. كل مستخدم ينتمي لأسرة واحدة، وكل بيانات
-- الفلوس تتبعها عبر household_id، فيخدم نشرٌ واحد عدّة أسر بلا تداخل.
CREATE TABLE households (
  id               BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  uuid             CHAR(36)         NOT NULL,
  name             VARCHAR(120)     NOT NULL,
  currency         CHAR(3)          NOT NULL DEFAULT 'EGP',
  timezone         VARCHAR(60)      NOT NULL DEFAULT 'Africa/Cairo',
  -- بداية الشهر المالي (يوم القبض): 1 = الشهر التقويمي العادي
  month_start_day  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status           ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_households_uuid (uuid),
  CONSTRAINT ck_households_month_start CHECK (month_start_day BETWEEN 1 AND 28)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                  CHAR(36)        NOT NULL,
  household_id          BIGINT UNSIGNED NOT NULL,
  full_name             VARCHAR(120)    NOT NULL,
  email                 VARCHAR(190)    NOT NULL,
  phone                 VARCHAR(30)     NULL,
  password_hash         VARCHAR(100)    NOT NULL,
  role                  ENUM('owner','admin','member','child','viewer') NOT NULL,
  status                ENUM('active','suspended') NOT NULL DEFAULT 'active',
  must_change_password  TINYINT(1)      NOT NULL DEFAULT 0,
  failed_logins         INT UNSIGNED    NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP       NULL,
  last_login_at         TIMESTAMP       NULL,
  password_changed_at   TIMESTAMP       NULL,
  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at            TIMESTAMP       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uuid (uuid),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_household (household_id, role),
  CONSTRAINT fk_users_household FOREIGN KEY (household_id) REFERENCES households (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- توكنات التجديد: نخزّن البصمة فقط. family_id يربط سلسلة التدوير،
-- فإعادة استخدام توكن مستبدَل (علامة سرقة) تُلغي السلسلة كلها.
CREATE TABLE refresh_tokens (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  family_id    CHAR(36)        NOT NULL,
  token_hash   CHAR(64)        NOT NULL,
  client_type  ENUM('web','mobile','desktop') NOT NULL DEFAULT 'web',
  user_agent   VARCHAR(255)    NULL,
  ip_address   VARCHAR(45)     NULL,
  expires_at   TIMESTAMP       NOT NULL,
  used_at      TIMESTAMP       NULL,
  revoked_at   TIMESTAMP       NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY ix_refresh_user (user_id, revoked_at),
  KEY ix_refresh_family (family_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64)        NOT NULL,
  expires_at  TIMESTAMP       NOT NULL,
  used_at     TIMESTAMP       NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_hash (token_hash),
  KEY ix_password_resets_user (user_id),
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- سجل التدقيق: مَن غيّر ماذا ومتى (قبل/بعد). لا يُحذف ولا يُعدَّل من التطبيق.
CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id  BIGINT UNSIGNED NULL,
  user_id       BIGINT UNSIGNED NULL,
  action        VARCHAR(60)     NOT NULL,
  entity        VARCHAR(40)     NOT NULL,
  entity_id     BIGINT UNSIGNED NULL,
  before_json   JSON            NULL,
  after_json    JSON            NULL,
  ip            VARCHAR(45)     NULL,
  user_agent    VARCHAR(255)    NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity, entity_id),
  KEY ix_audit_household (household_id, created_at),
  KEY ix_audit_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
