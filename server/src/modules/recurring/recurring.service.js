/**
 * ═══════════════════════════════════════════════════════════════
 *  الفواتير والدخل المتكرّر (إيجار، نت، اشتراكات، مرتب…)
 *
 *  • القاعدة تظهر لمن يرى **كل** حساباتها (access.js)، فقاعدة على جيب خاص
 *    لا يعرف بها غير صاحبه. ويعدّلها ويسجّلها من يحقّ له التسجيل عليها كلها.
 *  • المواعيد تُحسب من أول معاد (schedule.js)، و«ما اتعمل» في
 *    recurring_postings. فالمستحقّ = كل معاد لم يُسجَّل ولم يُتخطَّ.
 *  • تسجيل معاد = عملية حقيقية عبر transactionsService.create داخل نفس
 *    المعاملة مع سطر التسجيل، وقفل على القاعدة: الضغط مرتين (أو سيرفران
 *    في نفس اللحظة) لا يسجّل نفس المعاد مرتين — الطلب الثاني يرجّع الأول.
 *  • التلقائي (auto_post) يتسجّل في معاده باسم من أنشأ القاعدة وبصلاحياته،
 *    فلو فقد حقّه على الحساب تفضل القاعدة تذكيرًا ولا تُسجَّل.
 * ═══════════════════════════════════════════════════════════════
 */
import {
  query, queryOne, execute, transaction, placeholders, isDuplicate,
} from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { addDays, todayIn } from '../../utils/dates.js';
import { logger } from '../../utils/logger.js';
import { loadUser } from '../../middleware/authenticate.js';
import { canRecordOn, visibleAccounts } from '../accounts/access.js';
import { transactionsService } from '../transactions/transactions.service.js';
import { endAfterStart } from './recurring.validation.js';
import {
  nextPending, occurrenceIndex, occurrencesBetween, remainingCount,
} from './schedule.js';

/** أقصى مواعيد مستحقّة نعرضها لقاعدة واحدة (أسبوعية مهملة من سنين مثلًا) */
const MAX_DUE_PER_RULE = 60;

const FROM = `
  FROM recurring_rules r
  JOIN accounts a ON a.id = r.account_id
  LEFT JOIN accounts ta ON ta.id = r.to_account_id
  LEFT JOIN categories c ON c.id = r.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  LEFT JOIN users u ON u.id = r.created_by`;

const COLUMNS = `r.id, r.name, r.type, r.account_id, r.to_account_id, r.category_id, r.amount_minor, r.payee, r.note,
  r.frequency, r.interval_count, r.start_on, r.end_on, r.total_count, r.auto_post, r.created_by, r.created_at, r.updated_at,
  a.name AS account_name, a.color AS account_color, a.owner_user_id AS account_owner, a.archived_at AS account_archived_at,
  ta.name AS to_account_name, ta.color AS to_account_color, ta.owner_user_id AS to_account_owner, ta.archived_at AS to_account_archived_at,
  c.name AS category_name, c.icon AS category_icon, c.color AS category_color, c.archived_at AS category_archived_at,
  pc.name AS parent_category_name, pc.icon AS parent_category_icon,
  u.full_name AS created_by_name`;

/** الظهور: الحساب ظاهر، والوجهة (لو تحويل) ظاهرة كمان */
function visibleWhere(user) {
  const fromSide = visibleAccounts(user, 'a');
  const toSide = visibleAccounts(user, 'ta');
  return {
    sql: `r.household_id = ? AND ${fromSide.sql} AND (r.to_account_id IS NULL OR ${toSide.sql})`,
    params: [user.household_id, ...fromSide.params, ...toSide.params],
  };
}

/** المواعيد اللي اتعملت لكل قاعدة: Map(rule_id → Map(due_on → posting)) */
async function postingsOf(ruleIds) {
  const byRule = new Map(ruleIds.map((id) => [id, new Map()]));
  if (ruleIds.length === 0) return byRule;
  const rows = await query(
    `SELECT rule_id, due_on, status, transaction_id FROM recurring_postings WHERE rule_id IN (${placeholders(ruleIds.length)})`,
    ruleIds,
  );
  for (const row of rows) byRule.get(row.rule_id).set(row.due_on, row);
  return byRule;
}

/** مشكلة تمنع التسجيل وتحتاج تعديل القاعدة */
function problemOf(row) {
  if (row.account_archived_at || row.to_account_archived_at) return 'account_archived';
  if (row.category_archived_at) return 'category_archived';
  return null;
}

function present(user, row, postings = new Map()) {
  const {
    account_owner: accountOwner, to_account_owner: toOwner, account_archived_at: _aa, to_account_archived_at: _ta,
    category_archived_at: _ca, ...rest
  } = row;
  const handled = new Set(postings.keys());
  const next = nextPending(row, handled);
  const lastHandled = [...postings.keys()].sort().pop() ?? null;
  const canEdit = canRecordOn(user, { owner_user_id: accountOwner })
    && (!row.to_account_id || canRecordOn(user, { owner_user_id: toOwner }));

  return {
    ...rest,
    amount_minor: Number(row.amount_minor),
    auto_post: Boolean(row.auto_post),
    next_due_on: next?.due_on ?? null,
    remaining_count: remainingCount(row, handled),
    last_handled_on: lastHandled,
    problem: problemOf(row),
    can_edit: canEdit,
  };
}

async function findRow(user, id) {
  const { sql, params } = visibleWhere(user);
  const row = await queryOne(`SELECT ${COLUMNS} ${FROM} WHERE r.id = ? AND ${sql}`, [id, ...params]);
  if (!row) throw ApiError.notFound('الفاتورة المتكرّرة غير موجودة');
  return row;
}

async function findVisible(user, id) {
  const row = await findRow(user, id);
  const postings = (await postingsOf([row.id])).get(row.id);
  return present(user, row, postings);
}

/** كل القواعد الظاهرة (الأقرب معادًا أولًا، والمنتهية آخرًا) + مواعيدها اللي اتعملت */
async function loadVisible(user) {
  const { sql, params } = visibleWhere(user);
  const rows = await query(`SELECT ${COLUMNS} ${FROM} WHERE ${sql} ORDER BY r.name, r.id`, params);
  const postings = await postingsOf(rows.map((row) => row.id));
  const rules = rows
    .map((row) => present(user, row, postings.get(row.id)))
    .sort((a, b) => (a.next_due_on ?? '9999').localeCompare(b.next_due_on ?? '9999'));
  return { rules, postings };
}

const fieldError = (field, message, code = 'VALIDATION_ERROR') =>
  ApiError.unprocessable(message, { code, details: { [field]: message } });

/**
 * شكل القالب = شكل العملية (نفس قواعد transactions: الحساب، التصنيف، التحويل)،
 * ويُعاد بالقيم الجاهزة للحفظ (تصنيف التحويل null…).
 */
async function resolveTemplate(user, data, today) {
  const shaped = await transactionsService.checkShape(user, {
    type: data.type,
    account_id: data.account_id,
    to_account_id: data.to_account_id ?? null,
    category_id: data.category_id ?? null,
    amount_minor: data.amount_minor,
    occurred_on: today,
  });
  if (!endAfterStart(data)) throw fieldError('end_on', 'تاريخ النهاية قبل أول معاد');
  return { ...data, to_account_id: shaped.to_account_id ?? null, category_id: shaped.category_id ?? null };
}

const SAVED_FIELDS = [
  'name', 'type', 'account_id', 'to_account_id', 'category_id', 'amount_minor', 'payee', 'note',
  'frequency', 'interval_count', 'start_on', 'end_on', 'total_count', 'auto_post',
];

const assertEditable = (rule, verb = 'تعدّل') => {
  if (!rule.can_edit) throw ApiError.forbidden(`مينفعش ${verb} الفاتورة دي`, { code: 'FORBIDDEN' });
};

/** المعاد لازم يكون من مواعيد القاعدة وداخل نهايتها */
function assertOccurrence(rule, dueOn) {
  if (occurrenceIndex(rule, dueOn) < 0) throw fieldError('due_on', 'التاريخ ده مش من مواعيد الفاتورة');
}

/** العملية المرتبطة لو ظاهرة للمستخدم (قد يكون سدّدها غيره من جيبه الخاص) */
async function visibleTransaction(user, id, db) {
  if (!id) return null;
  try {
    return await transactionsService.find(user, id, db);
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

/**
 * يسجّل معادًا واحدًا كعملية — قلب «دفعت» والتسجيل التلقائي.
 * يعيد { transaction, already_posted }.
 */
async function postOccurrence(user, rule, dueOn, overrides = {}, { createdBy = user.id } = {}) {
  const run = () => transaction(async (db) => {
    // قفل القاعدة: أي تسجيل متزامن لنفس القاعدة ينتظر حتى ننتهي
    await db.queryOne('SELECT id FROM recurring_rules WHERE id = ? FOR UPDATE', [rule.id]);
    const existing = await db.queryOne(
      'SELECT status, transaction_id FROM recurring_postings WHERE rule_id = ? AND due_on = ? FOR UPDATE',
      [rule.id, dueOn],
    );
    if (existing?.status === 'skipped') {
      throw ApiError.conflict('المعاد ده اتخطّى قبل كده', { code: 'ALREADY_SKIPPED' });
    }
    if (existing) return { transaction: await visibleTransaction(user, existing.transaction_id, db), already_posted: true };

    const created = await transactionsService.create(user, {
      type: rule.type,
      account_id: overrides.account_id ?? rule.account_id,
      to_account_id: rule.to_account_id,
      category_id: rule.category_id,
      amount_minor: overrides.amount_minor ?? rule.amount_minor,
      occurred_on: overrides.occurred_on ?? todayIn(user.timezone),
      payee: rule.payee ?? rule.name,
      note: overrides.note !== undefined ? overrides.note : rule.note,
    }, db);
    await db.execute(
      `INSERT INTO recurring_postings (rule_id, due_on, status, transaction_id, created_by)
       VALUES (?, ?, 'posted', ?, ?)`,
      [rule.id, dueOn, created.id, createdBy],
    );
    return { transaction: created, already_posted: false };
  });

  try {
    return await run();
  } catch (error) {
    // سباق نادر تجاوز القفل (القيد الفريد هو الحارس الأخير): المعاد اتسجّل للتوّ
    if (isDuplicate(error, 'uq_rp_occurrence')) return run();
    throw error;
  }
}

/** موجز للتدقيق */
export const briefRule = (rule) => ({
  id: rule.id, name: rule.name, type: rule.type, account_id: rule.account_id, to_account_id: rule.to_account_id,
  category_id: rule.category_id, amount_minor: rule.amount_minor, frequency: rule.frequency,
  interval_count: rule.interval_count, start_on: rule.start_on, end_on: rule.end_on,
  total_count: rule.total_count, auto_post: rule.auto_post,
});

export const briefTransaction = (tx) => ({
  id: tx.id, type: tx.type, account_id: tx.account_id, to_account_id: tx.to_account_id,
  category_id: tx.category_id, amount_minor: tx.amount_minor, occurred_on: tx.occurred_on,
});

export const recurringService = {
  async list(user) {
    return (await loadVisible(user)).rules;
  },

  /** القاعدة + آخر ما اتعمل منها */
  async find(user, id) {
    const rule = await findVisible(user, id);
    const history = await query(
      `SELECT p.due_on, p.status, p.transaction_id, p.created_at
         FROM recurring_postings p WHERE p.rule_id = ? ORDER BY p.due_on DESC LIMIT 12`,
      [id],
    );
    return { ...rule, history };
  },

  async create(user, input) {
    const data = await resolveTemplate(user, {
      ...input,
      interval_count: input.interval_count ?? 1,
      end_on: input.end_on ?? null,
      total_count: input.total_count ?? null,
      auto_post: input.auto_post ?? false,
    }, todayIn(user.timezone));

    const result = await execute(
      `INSERT INTO recurring_rules (household_id, ${SAVED_FIELDS.join(', ')}, created_by, updated_by)
       VALUES (?, ${placeholders(SAVED_FIELDS.length)}, ?, ?)`,
      [user.household_id, ...SAVED_FIELDS.map((field) => data[field] ?? null), user.id, user.id],
    );
    return findVisible(user, result.insertId);
  },

  /** يدمج ثم يتحقّق من الشكل الكامل (زي العمليات). تغيير المواعيد لا يمسّ ما اتسجّل. */
  async update(user, id, changes) {
    const before = await findVisible(user, id);
    assertEditable(before);
    const merged = Object.fromEntries(SAVED_FIELDS.map((field) => [field, changes[field] !== undefined ? changes[field] : before[field]]));
    const data = await resolveTemplate(user, merged, todayIn(user.timezone));
    await execute(
      `UPDATE recurring_rules SET ${SAVED_FIELDS.map((field) => `${field} = ?`).join(', ')}, updated_by = ? WHERE id = ?`,
      [...SAVED_FIELDS.map((field) => data[field] ?? null), user.id, id],
    );
    return { before, after: await findVisible(user, id) };
  },

  /** الحذف يمسح القاعدة وسجلّ مواعيدها — العمليات اللي اتسجّلت منها تفضل كما هي */
  async remove(user, id) {
    const before = await findVisible(user, id);
    assertEditable(before, 'تحذف');
    await execute('DELETE FROM recurring_rules WHERE id = ?', [id]);
    return before;
  },

  /** «دفعت» / «اتقبض»: عملية حقيقية للمعاد ده */
  async post(user, id, input) {
    const rule = await findVisible(user, id);
    assertEditable(rule, 'تسجّل');
    assertOccurrence(rule, input.due_on);
    const result = await postOccurrence(user, rule, input.due_on, input);
    return { rule, due_on: input.due_on, ...result };
  },

  /** تخطّي معاد (الفاتورة مجتش الشهر ده، أو اتدفعت بره التطبيق) */
  async skip(user, id, { due_on: dueOn }) {
    const rule = await findVisible(user, id);
    assertEditable(rule, 'تتخطّى');
    assertOccurrence(rule, dueOn);
    const existing = await queryOne('SELECT status FROM recurring_postings WHERE rule_id = ? AND due_on = ?', [id, dueOn]);
    if (existing?.status === 'posted') throw ApiError.conflict('المعاد ده اتسجّل بالفعل', { code: 'ALREADY_POSTED' });
    if (!existing) {
      try {
        await execute(
          "INSERT INTO recurring_postings (rule_id, due_on, status, created_by) VALUES (?, ?, 'skipped', ?)",
          [id, dueOn, user.id],
        );
      } catch (error) {
        if (!isDuplicate(error, 'uq_rp_occurrence')) throw error;
      }
    }
    return { rule, due_on: dueOn, already_skipped: Boolean(existing) };
  },

  /**
   * المواعيد المستحقّة لحدّ `to` (والمتأخرة من أول معاد) للقواعد الظاهرة.
   * يعيد { items, active } — active = عدد القواعد اللي لسه ليها مواعيد.
   */
  async dueItems(user, { from, to, today }) {
    const { rules, postings } = await loadVisible(user);
    const items = [];
    for (const rule of rules) {
      if (!rule.next_due_on || rule.next_due_on > to) continue;
      const handled = postings.get(rule.id);
      const start = from && from > rule.next_due_on ? from : rule.next_due_on;
      const pending = occurrencesBetween(rule, { from: start, to })
        .filter((occurrence) => !handled.has(occurrence.due_on))
        .slice(0, MAX_DUE_PER_RULE);
      for (const { due_on: dueOn } of pending) {
        items.push({
          key: `recurring:${rule.id}:${dueOn}`,
          source: 'recurring',
          source_id: rule.id,
          item_id: null,
          due_on: dueOn,
          name: rule.name,
          type: rule.type,
          amount_minor: rule.amount_minor,
          payee: rule.payee,
          account_id: rule.account_id,
          account_name: rule.account_name,
          to_account_id: rule.to_account_id,
          to_account_name: rule.to_account_name,
          category_id: rule.category_id,
          category_name: rule.category_name,
          category_icon: rule.category_icon ?? rule.parent_category_icon,
          category_color: rule.category_color,
          frequency: rule.frequency,
          interval_count: rule.interval_count,
          auto_post: rule.auto_post,
          installment: null,
          problem: rule.problem,
          can_post: rule.can_edit && !rule.problem,
          status: dueOn < today ? 'overdue' : dueOn === today ? 'today' : 'upcoming',
        });
      }
    }
    return { items, active: rules.filter((rule) => rule.next_due_on).length };
  },

  /**
   * يسجّل كل المواعيد التلقائية المستحقّة لحدّ النهارده (بتوقيت كل أسرة).
   * Idempotent: تشغيله مرتين أو من سيرفرين لا يكرّر عملية.
   * `householdId` يقصره على أسرة واحدة. يعيد { posted, failed }.
   */
  async postDueAuto({ now = new Date(), householdId } = {}) {
    // أبعد «نهارده» ممكن في أي منطقة زمنية = تاريخ UTC + يوم
    const horizon = addDays(todayIn('UTC', now), 1);
    const rules = await query(
      `SELECT r.*, h.timezone FROM recurring_rules r JOIN households h ON h.id = r.household_id
        WHERE r.auto_post = 1 AND r.start_on <= ? AND h.status = 'active' ${householdId ? 'AND r.household_id = ?' : ''}
        ORDER BY r.id`,
      householdId ? [horizon, householdId] : [horizon],
    );
    const postings = await postingsOf(rules.map((rule) => rule.id));
    const actors = new Map();
    const summary = { posted: 0, failed: 0 };

    for (const rule of rules) {
      const today = todayIn(rule.timezone, now);
      const handled = postings.get(rule.id);
      const pending = occurrencesBetween(rule, { to: today }).filter((occurrence) => !handled.has(occurrence.due_on));
      if (pending.length === 0) continue;

      if (!actors.has(rule.created_by)) actors.set(rule.created_by, rule.created_by ? await loadUser(rule.created_by) : null);
      const actor = actors.get(rule.created_by);
      if (!actor || actor.status !== 'active' || actor.household_id !== rule.household_id) {
        logger.warn(`تسجيل تلقائي: القاعدة ${rule.id} بلا صاحب نشط — تفضل تذكيرًا`);
        summary.failed += 1;
        continue;
      }

      for (const { due_on: dueOn } of pending) {
        try {
          // المعاد التلقائي يتسجّل بتاريخه هو، لا بتاريخ تشغيل المهمة
          const { transaction: tx, already_posted: already } = await postOccurrence(actor, rule, dueOn, { occurred_on: dueOn }, { createdBy: null });
          if (already) continue;
          summary.posted += 1;
          const req = { user: actor, context: { ip: null, userAgent: 'auto-post' } };
          await audit(req, { action: 'transaction.create', entity: 'transaction', entityId: tx.id, after: briefTransaction(tx) });
          await audit(req, { action: 'recurring.post', entity: 'recurring_rule', entityId: rule.id, after: { name: rule.name, due_on: dueOn, transaction_id: tx.id, amount_minor: tx.amount_minor, auto: true } });
        } catch (error) {
          // حساب اتأرشف أو صلاحية اتشالت: نسيبها تذكيرًا ونكمل باقي القواعد
          logger.warn(`تسجيل تلقائي: القاعدة ${rule.id} معاد ${dueOn} — ${error.message}`);
          summary.failed += 1;
          break;
        }
      }
    }
    return summary;
  },
};
