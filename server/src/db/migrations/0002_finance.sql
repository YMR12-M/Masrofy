-- ═══════════════════════════════════════════════════════════════
--  0002 — الفلوس: الحسابات والتصنيفات والعمليات والميزانيات
--
--  رصيد الحساب لا يُخزَّن: يُحسب دائمًا = الرصيد الافتتاحي + أثر عملياته.
--  رقم مخزَّن ثانٍ كان سيختلف يومًا ما عن مجموع العمليات، ولا يعرف أحد
--  أيّهما الصحيح. على حجم بيت (آلاف العمليات) الحساب الفوري سريع بالفهارس.
-- ═══════════════════════════════════════════════════════════════

-- الحساب: كاش، بنك، محفظة إلكترونية (فودافون كاش، إنستاباي…)، بطاقة ائتمان، ادخار.
-- owner_user_id = NULL ← حساب مشترك للأسرة. غير ذلك ← خاص بفرد لا يراه غيره.
CREATE TABLE accounts (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id           BIGINT UNSIGNED NOT NULL,
  owner_user_id          BIGINT UNSIGNED NULL,
  name                   VARCHAR(80)     NOT NULL,
  type                   ENUM('cash','bank','wallet','card','savings','other') NOT NULL,
  institution            VARCHAR(80)     NULL,
  -- قد يكون سالبًا (بطاقة عليها مديونية من قبل التسجيل)
  opening_balance_minor  BIGINT          NOT NULL DEFAULT 0,
  credit_limit_minor     BIGINT UNSIGNED NULL,
  color                  CHAR(7)         NOT NULL DEFAULT '#0d6b57',
  include_in_net_worth   TINYINT(1)      NOT NULL DEFAULT 1,
  sort_order             INT             NOT NULL DEFAULT 0,
  archived_at            TIMESTAMP       NULL,
  created_by             BIGINT UNSIGNED NULL,
  created_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- الاسم فريد بين الحسابات النشطة لنفس المالك (المؤرشف يحرّر اسمه)
  owner_key              BIGINT UNSIGNED AS (IFNULL(owner_user_id, 0)) STORED,
  active_name            VARCHAR(80)     AS (IF(archived_at IS NULL, name, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_name (household_id, owner_key, active_name),
  KEY ix_accounts_household (household_id, archived_at),
  KEY ix_accounts_owner (owner_user_id),
  CONSTRAINT fk_accounts_household FOREIGN KEY (household_id) REFERENCES households (id),
  CONSTRAINT fk_accounts_owner     FOREIGN KEY (owner_user_id) REFERENCES users (id),
  CONSTRAINT fk_accounts_creator   FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- التصنيفات: مستويان فقط (رئيسي ← فرعي)، ولكل نوع (مصروف/دخل) شجرته.
CREATE TABLE categories (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id  BIGINT UNSIGNED NOT NULL,
  parent_id     BIGINT UNSIGNED NULL,
  kind          ENUM('expense','income') NOT NULL,
  name          VARCHAR(60)     NOT NULL,
  icon          VARCHAR(16)     NULL,
  color         CHAR(7)         NOT NULL DEFAULT '#57534e',
  sort_order    INT             NOT NULL DEFAULT 0,
  archived_at   TIMESTAMP       NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  parent_key    BIGINT UNSIGNED AS (IFNULL(parent_id, 0)) STORED,
  active_name   VARCHAR(60)     AS (IF(archived_at IS NULL, name, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (household_id, kind, parent_key, active_name),
  KEY ix_categories_household (household_id, kind, archived_at),
  KEY ix_categories_parent (parent_id),
  CONSTRAINT fk_categories_household FOREIGN KEY (household_id) REFERENCES households (id),
  CONSTRAINT fk_categories_parent    FOREIGN KEY (parent_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- العمليات: مصروف أو دخل على حساب واحد، أو تحويل بين حسابين.
-- المبلغ موجب دائمًا والنوع يحدّد اتجاهه؛ والقيود تمنع أي شكل غير منطقي
-- حتى لو أخطأ الكود (تحويل بلا وجهة، مصروف بلا تصنيف، تحويل لنفس الحساب).
CREATE TABLE transactions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id   BIGINT UNSIGNED NOT NULL,
  type           ENUM('expense','income','transfer') NOT NULL,
  account_id     BIGINT UNSIGNED NOT NULL,
  to_account_id  BIGINT UNSIGNED NULL,
  category_id    BIGINT UNSIGNED NULL,
  amount_minor   BIGINT UNSIGNED NOT NULL,
  occurred_on    DATE            NOT NULL,
  payee          VARCHAR(120)    NULL,
  note           VARCHAR(500)    NULL,
  created_by     BIGINT UNSIGNED NULL,
  updated_by     BIGINT UNSIGNED NULL,
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_tx_household_date (household_id, occurred_on),
  KEY ix_tx_account_date (account_id, occurred_on),
  KEY ix_tx_to_account_date (to_account_id, occurred_on),
  KEY ix_tx_category_date (category_id, occurred_on),
  CONSTRAINT fk_tx_household  FOREIGN KEY (household_id)  REFERENCES households (id),
  CONSTRAINT fk_tx_account    FOREIGN KEY (account_id)    REFERENCES accounts (id),
  CONSTRAINT fk_tx_to_account FOREIGN KEY (to_account_id) REFERENCES accounts (id),
  CONSTRAINT fk_tx_category   FOREIGN KEY (category_id)   REFERENCES categories (id),
  CONSTRAINT fk_tx_creator    FOREIGN KEY (created_by)    REFERENCES users (id),
  CONSTRAINT fk_tx_updater    FOREIGN KEY (updated_by)    REFERENCES users (id),
  CONSTRAINT ck_tx_amount CHECK (amount_minor > 0),
  CONSTRAINT ck_tx_shape CHECK (
    (type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id AND category_id IS NULL)
    OR (type <> 'transfer' AND to_account_id IS NULL AND category_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- الميزانية: حدّ شهري ثابت لتصنيف مصروف، يتكرّر كل شهر مالي.
-- ميزانية التصنيف الرئيسي تشمل مصروف كل فروعه.
CREATE TABLE budgets (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id  BIGINT UNSIGNED NOT NULL,
  category_id   BIGINT UNSIGNED NOT NULL,
  amount_minor  BIGINT UNSIGNED NOT NULL,
  -- نُنبّه عند بلوغ هذه النسبة من الحدّ (8000 = 80%)
  alert_bps     INT UNSIGNED    NOT NULL DEFAULT 8000,
  created_by    BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_budgets_category (household_id, category_id),
  CONSTRAINT fk_budgets_household FOREIGN KEY (household_id) REFERENCES households (id),
  CONSTRAINT fk_budgets_category  FOREIGN KEY (category_id)  REFERENCES categories (id),
  CONSTRAINT fk_budgets_creator   FOREIGN KEY (created_by)   REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_budgets_amount CHECK (amount_minor > 0),
  CONSTRAINT ck_budgets_alert  CHECK (alert_bps BETWEEN 1000 AND 10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
