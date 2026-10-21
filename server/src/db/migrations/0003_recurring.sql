-- ═══════════════════════════════════════════════════════════════
--  0003 — الفواتير المتكرّرة والتقسيط
--
--  • القاعدة المتكرّرة قالب عملية (إيجار، نت، اشتراك، مرتب…) بموعد
--    أسبوعي/شهري/سنوي. مواعيدها لا تُخزَّن: تُحسب من تاريخ أول معاد
--    (start_on) — فالقاعدة يوم 31 تقع 28/29 فبراير ثم 31 مارس، بلا انجراف.
--  • ما «اتعمل» من المواعيد يُسجَّل في recurring_postings: عملية حقيقية
--    (posted) أو تخطّي (skipped). القيد الفريد (القاعدة، المعاد) يمنع تسجيل
--    نفس المعاد مرتين. حذف العملية المولّدة يحذف التسجيل فيرجع المعاد مستحقًّا.
--  • التقسيط خطّة بجدول سداد مخزَّن (المقدّم = صف 0، ثم الأقساط 1..n).
--    القسط «مدفوع» لو مربوط بعملية أو اتعلّم مدفوعًا من غير تسجيل
--    (دُفع قبل استخدام التطبيق). حذف العملية يفكّ الربط فيرجع القسط مستحقًّا.
--  • المبالغ بالقروش، والإجماليات والمتبقّي تُحسب ولا تُخزَّن.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE recurring_rules (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id    BIGINT UNSIGNED NOT NULL,
  name            VARCHAR(80)     NOT NULL,
  type            ENUM('expense','income','transfer') NOT NULL,
  account_id      BIGINT UNSIGNED NOT NULL,
  to_account_id   BIGINT UNSIGNED NULL,
  category_id     BIGINT UNSIGNED NULL,
  amount_minor    BIGINT UNSIGNED NOT NULL,
  payee           VARCHAR(120)    NULL,
  note            VARCHAR(500)    NULL,
  -- كل interval_count أسبوع/شهر/سنة، بدءًا من start_on (أول معاد)
  frequency       ENUM('weekly','monthly','yearly') NOT NULL,
  interval_count  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  start_on        DATE            NOT NULL,
  -- النهاية (اختيارية): آخر تاريخ مسموح، و/أو عدد المرات من أول معاد — أيّهما أسبق
  end_on          DATE            NULL,
  total_count     SMALLINT UNSIGNED NULL,
  -- تلقائي: تتسجّل لوحدها في معادها باسم من أنشأها. وإلا تذكير فقط.
  auto_post       TINYINT(1)      NOT NULL DEFAULT 0,
  created_by      BIGINT UNSIGNED NULL,
  updated_by      BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_rr_household (household_id),
  KEY ix_rr_auto (auto_post, start_on),
  KEY ix_rr_account (account_id),
  KEY ix_rr_to_account (to_account_id),
  KEY ix_rr_category (category_id),
  CONSTRAINT fk_rr_household  FOREIGN KEY (household_id)  REFERENCES households (id),
  CONSTRAINT fk_rr_account    FOREIGN KEY (account_id)    REFERENCES accounts (id),
  CONSTRAINT fk_rr_to_account FOREIGN KEY (to_account_id) REFERENCES accounts (id),
  CONSTRAINT fk_rr_category   FOREIGN KEY (category_id)   REFERENCES categories (id),
  CONSTRAINT fk_rr_creator    FOREIGN KEY (created_by)    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_rr_updater    FOREIGN KEY (updated_by)    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_rr_amount   CHECK (amount_minor > 0),
  CONSTRAINT ck_rr_interval CHECK (interval_count BETWEEN 1 AND 52),
  CONSTRAINT ck_rr_count    CHECK (total_count IS NULL OR total_count >= 1),
  CONSTRAINT ck_rr_end      CHECK (end_on IS NULL OR end_on >= start_on),
  CONSTRAINT ck_rr_shape CHECK (
    (type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id AND category_id IS NULL)
    OR (type <> 'transfer' AND to_account_id IS NULL AND category_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- مواعيد القاعدة اللي اتعملت. posted ← معها عملية؛ skipped ← اتخطّت بلا عملية.
CREATE TABLE recurring_postings (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_id         BIGINT UNSIGNED NOT NULL,
  due_on          DATE            NOT NULL,
  status          ENUM('posted','skipped') NOT NULL,
  transaction_id  BIGINT UNSIGNED NULL,
  -- NULL ← سجّلها السيرفر تلقائيًّا
  created_by      BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rp_occurrence (rule_id, due_on),
  UNIQUE KEY uq_rp_transaction (transaction_id),
  CONSTRAINT fk_rp_rule        FOREIGN KEY (rule_id)        REFERENCES recurring_rules (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_transaction FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_creator     FOREIGN KEY (created_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- خطّة تقسيط: مشتريات تتدفع على أقساط شهرية من حساب واحد وتحت تصنيف مصروف.
CREATE TABLE installment_plans (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  household_id        BIGINT UNSIGNED NOT NULL,
  name                VARCHAR(80)     NOT NULL,
  account_id          BIGINT UNSIGNED NOT NULL,
  category_id         BIGINT UNSIGNED NOT NULL,
  payee               VARCHAR(120)    NULL,
  note                VARCHAR(500)    NULL,
  -- مدخلات الجدول كما كتبها المستخدم (الصفوف نفسها في installment_items)
  total_minor         BIGINT UNSIGNED NOT NULL,
  down_payment_minor  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  installment_count   SMALLINT UNSIGNED NOT NULL,
  purchase_on         DATE            NOT NULL,
  first_due_on        DATE            NOT NULL,
  created_by          BIGINT UNSIGNED NULL,
  updated_by          BIGINT UNSIGNED NULL,
  created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ip_household (household_id),
  KEY ix_ip_account (account_id),
  KEY ix_ip_category (category_id),
  CONSTRAINT fk_ip_household FOREIGN KEY (household_id) REFERENCES households (id),
  CONSTRAINT fk_ip_account   FOREIGN KEY (account_id)   REFERENCES accounts (id),
  CONSTRAINT fk_ip_category  FOREIGN KEY (category_id)  REFERENCES categories (id),
  CONSTRAINT fk_ip_creator   FOREIGN KEY (created_by)   REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_ip_updater   FOREIGN KEY (updated_by)   REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_ip_count CHECK (installment_count BETWEEN 1 AND 120),
  CONSTRAINT ck_ip_total CHECK (total_minor >= down_payment_minor + installment_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- جدول السداد: seq 0 = المقدّم (لو فيه)، و1..n الأقساط.
CREATE TABLE installment_items (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id         BIGINT UNSIGNED NOT NULL,
  seq             SMALLINT UNSIGNED NOT NULL,
  due_on          DATE            NOT NULL,
  amount_minor    BIGINT UNSIGNED NOT NULL,
  -- العملية اللي سدّدته (حذفها يرجّع القسط مستحقًّا)
  transaction_id  BIGINT UNSIGNED NULL,
  -- اتدفع من غير ما يتسجّل كعملية (قبل استخدام التطبيق مثلًا)
  settled_at      TIMESTAMP       NULL,
  settled_by      BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ii_seq (plan_id, seq),
  UNIQUE KEY uq_ii_transaction (transaction_id),
  KEY ix_ii_due (due_on),
  CONSTRAINT fk_ii_plan        FOREIGN KEY (plan_id)        REFERENCES installment_plans (id) ON DELETE CASCADE,
  CONSTRAINT fk_ii_transaction FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE SET NULL,
  CONSTRAINT fk_ii_settler     FOREIGN KEY (settled_by)     REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_ii_amount CHECK (amount_minor > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
