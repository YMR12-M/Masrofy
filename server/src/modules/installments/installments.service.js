/**
 * ═══════════════════════════════════════════════════════════════
 *  التقسيط: مشتريات بمقدّم + أقساط شهرية (موبايل، تلاجة، عربية…)
 *
 *  • الجدول يُولَّد مرّة عند الإنشاء ويُخزَّن: صف 0 = المقدّم (لو فيه) يوم
 *    الشراء، ثم الأقساط شهريًّا من أول قسط بنفس قواعد آخر الشهر (schedule.js).
 *    القسمة بالقروش: كل الأقساط متساوية والقسط الأخير ياخد الباقي، فمجموع
 *    الجدول = الإجمالي بالظبط.
 *  • القسط «مدفوع» لو مربوط بعملية أو متعلّم «اتدفع من غير تسجيل». حذف
 *    العملية يفكّ الربط فيرجع القسط مستحقًّا. المدفوع والمتبقّي يُحسبان.
 *  • الخطّة تظهر لمن يرى حسابها، ويسدّدها ويعدّلها من يحقّ له التسجيل عليه.
 *  • تغيير المبلغ أو العدد أو المواعيد مسموح طالما لم يُدفع شيء (يعيد التوليد).
 * ═══════════════════════════════════════════════════════════════
 */
import {
  query, queryOne, execute, transaction, placeholders,
} from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { todayIn } from '../../utils/dates.js';
import { ratioBps } from '../../utils/money.js';
import { canRecordOn, canSeeAccount, visibleAccounts } from '../accounts/access.js';
import { transactionsService } from '../transactions/transactions.service.js';
import { occurrenceAt } from '../recurring/schedule.js';
import { SCHEDULE_FIELDS, scheduleProblem } from './installments.validation.js';

/** جدول السداد: [{ seq, due_on, amount_minor }] */
export function buildSchedule({
  total_minor: total, down_payment_minor: down = 0, installment_count: count, purchase_on: purchaseOn, first_due_on: firstDue,
}) {
  const items = down > 0 ? [{ seq: 0, due_on: purchaseOn, amount_minor: down }] : [];
  const rest = total - down;
  const base = Math.floor(rest / count);
  const monthly = { frequency: 'monthly', interval_count: 1, start_on: firstDue };
  for (let seq = 1; seq <= count; seq += 1) {
    items.push({ seq, due_on: occurrenceAt(monthly, seq - 1), amount_minor: seq === count ? rest - base * (count - 1) : base });
  }
  return items;
}

const FROM = `
  FROM installment_plans p
  JOIN accounts a ON a.id = p.account_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  LEFT JOIN users u ON u.id = p.created_by`;

const COLUMNS = `p.id, p.name, p.account_id, p.category_id, p.payee, p.note, p.total_minor, p.down_payment_minor,
  p.installment_count, p.purchase_on, p.first_due_on, p.created_by, p.created_at, p.updated_at,
  a.name AS account_name, a.color AS account_color, a.owner_user_id AS account_owner, a.archived_at AS account_archived_at,
  c.name AS category_name, c.icon AS category_icon, c.color AS category_color, c.archived_at AS category_archived_at,
  pc.name AS parent_category_name, pc.icon AS parent_category_icon,
  u.full_name AS created_by_name`;

function visibleWhere(user) {
  const visible = visibleAccounts(user, 'a');
  return { sql: `p.household_id = ? AND ${visible.sql}`, params: [user.household_id, ...visible.params] };
}

const isPaid = (item) => Boolean(item.transaction_id || item.settled_at);

const statusOf = (dueOn, today) => (dueOn < today ? 'overdue' : dueOn === today ? 'today' : 'upcoming');

/** صفوف الجدول لكل خطّة: Map(plan_id → [items]) */
async function itemsOf(planIds) {
  const byPlan = new Map(planIds.map((id) => [id, []]));
  if (planIds.length === 0) return byPlan;
  const rows = await query(
    `SELECT i.id, i.plan_id, i.seq, i.due_on, i.amount_minor, i.transaction_id, i.settled_at,
            t.occurred_on AS paid_on, ta.owner_user_id AS paid_account_owner
       FROM installment_items i
       LEFT JOIN transactions t ON t.id = i.transaction_id
       LEFT JOIN accounts ta ON ta.id = t.account_id
      WHERE i.plan_id IN (${placeholders(planIds.length)})
      ORDER BY i.plan_id, i.seq`,
    planIds,
  );
  for (const row of rows) byPlan.get(row.plan_id).push(row);
  return byPlan;
}

/** القسط كما يُعرض: لو سدّده غيرك من جيبه الخاص تعرف إنه اتدفع بس، لا العملية */
function presentItem(user, item, today) {
  const txVisible = Boolean(item.transaction_id) && canSeeAccount(user, { owner_user_id: item.paid_account_owner });
  let status = statusOf(item.due_on, today);
  if (item.transaction_id) status = 'paid';
  else if (item.settled_at) status = 'settled';
  return {
    id: item.id,
    seq: item.seq,
    due_on: item.due_on,
    amount_minor: Number(item.amount_minor),
    paid: isPaid(item),
    transaction_id: txVisible ? item.transaction_id : null,
    paid_on: txVisible ? item.paid_on : null,
    settled_at: item.settled_at,
    status,
  };
}

function present(user, row, rawItems, today) {
  const {
    account_owner: accountOwner, account_archived_at: accountArchived, category_archived_at: categoryArchived, ...rest
  } = row;
  const items = rawItems.map((item) => presentItem(user, item, today));
  const total = items.reduce((sum, item) => sum + item.amount_minor, 0);
  const paid = items.filter((item) => item.paid).reduce((sum, item) => sum + item.amount_minor, 0);
  const next = items.find((item) => !item.paid) ?? null;

  let problem = null;
  if (accountArchived) problem = 'account_archived';
  else if (categoryArchived) problem = 'category_archived';

  return {
    plan: {
      ...rest,
      total_minor: total,
      down_payment_minor: Number(row.down_payment_minor),
      paid_minor: paid,
      remaining_minor: total - paid,
      paid_bps: ratioBps(paid, total),
      installments_paid: items.filter((item) => item.seq > 0 && item.paid).length,
      overdue_count: items.filter((item) => item.status === 'overdue').length,
      next_item: next && { id: next.id, seq: next.seq, due_on: next.due_on, amount_minor: next.amount_minor, status: next.status },
      done: total > 0 && paid === total,
      problem,
      can_edit: canRecordOn(user, { owner_user_id: accountOwner }),
    },
    items,
  };
}

async function findVisible(user, id) {
  const { sql, params } = visibleWhere(user);
  const row = await queryOne(`SELECT ${COLUMNS} ${FROM} WHERE p.id = ? AND ${sql}`, [id, ...params]);
  if (!row) throw ApiError.notFound('خطّة التقسيط غير موجودة');
  const items = (await itemsOf([row.id])).get(row.id);
  const { plan, items: presented } = present(user, row, items, todayIn(user.timezone));
  return { ...plan, items: presented };
}

/** الحساب والتصنيف بنفس قواعد تسجيل مصروف عليهم */
const assertTemplate = (user, data, today) => transactionsService.checkShape(user, {
  type: 'expense', account_id: data.account_id, category_id: data.category_id, amount_minor: 1, occurred_on: today,
});

const assertEditable = (plan, verb = 'تعدّل') => {
  if (!plan.can_edit) throw ApiError.forbidden(`مينفعش ${verb} خطّة التقسيط دي`, { code: 'FORBIDDEN' });
};

const PLAN_FIELDS = ['name', 'account_id', 'category_id', 'payee', 'note', ...SCHEDULE_FIELDS];

async function insertItems(db, planId, items) {
  await db.execute(
    `INSERT INTO installment_items (plan_id, seq, due_on, amount_minor) VALUES ${items.map(() => '(?, ?, ?, ?)').join(', ')}`,
    items.flatMap((item) => [planId, item.seq, item.due_on, item.amount_minor]),
  );
}

/** العملية المرتبطة لو ظاهرة للمستخدم */
async function visibleTransaction(user, id, db) {
  try {
    return await transactionsService.find(user, id, db);
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

export const briefPlan = (plan) => ({
  id: plan.id, name: plan.name, account_id: plan.account_id, category_id: plan.category_id,
  total_minor: plan.total_minor, down_payment_minor: plan.down_payment_minor,
  installment_count: plan.installment_count, purchase_on: plan.purchase_on, first_due_on: plan.first_due_on,
});

export const installmentsService = {
  async list(user) {
    const { sql, params } = visibleWhere(user);
    const rows = await query(`SELECT ${COLUMNS} ${FROM} WHERE ${sql} ORDER BY p.created_at DESC, p.id DESC`, params);
    const items = await itemsOf(rows.map((row) => row.id));
    const today = todayIn(user.timezone);
    const plans = rows.map((row) => present(user, row, items.get(row.id), today).plan);
    // الجارية أولًا (الأقرب قسطًا)، والمخلّصة آخرًا
    return plans.sort((a, b) => (a.next_item?.due_on ?? '9999').localeCompare(b.next_item?.due_on ?? '9999'));
  },

  find: findVisible,

  async create(user, input) {
    const today = todayIn(user.timezone);
    const data = {
      ...input,
      down_payment_minor: input.down_payment_minor ?? 0,
      // يوم الشراء (معاد المقدّم): النهارده، إلا لو أول قسط فات
      purchase_on: input.purchase_on ?? (today <= input.first_due_on ? today : input.first_due_on),
    };
    await assertTemplate(user, data, today);

    const id = await transaction(async (db) => {
      const result = await db.execute(
        `INSERT INTO installment_plans (household_id, ${PLAN_FIELDS.join(', ')}, created_by, updated_by)
         VALUES (?, ${placeholders(PLAN_FIELDS.length)}, ?, ?)`,
        [user.household_id, ...PLAN_FIELDS.map((field) => data[field] ?? null), user.id, user.id],
      );
      await insertItems(db, result.insertId, buildSchedule(data));
      return result.insertId;
    });
    return findVisible(user, id);
  },

  async update(user, id, changes) {
    const before = await findVisible(user, id);
    assertEditable(before);
    const merged = Object.fromEntries(PLAN_FIELDS.map((field) => [field, changes[field] !== undefined ? changes[field] : before[field]]));
    await assertTemplate(user, merged, todayIn(user.timezone));

    const reschedule = SCHEDULE_FIELDS.some((field) => changes[field] !== undefined && changes[field] !== before[field]);
    if (reschedule) {
      if (before.items.some((item) => item.paid)) {
        throw ApiError.conflict('فيه أقساط اتدفعت — مينفعش تغيّر المبلغ أو المواعيد. احذف الخطّة واعملها من جديد لو لازم.', { code: 'PLAN_HAS_PAYMENTS' });
      }
      const problem = scheduleProblem(merged);
      if (problem) throw ApiError.unprocessable(Object.values(problem)[0], { code: 'VALIDATION_ERROR', details: problem });
    }

    await transaction(async (db) => {
      await db.execute(
        `UPDATE installment_plans SET ${PLAN_FIELDS.map((field) => `${field} = ?`).join(', ')}, updated_by = ? WHERE id = ?`,
        [...PLAN_FIELDS.map((field) => merged[field] ?? null), user.id, id],
      );
      if (reschedule) {
        await db.execute('DELETE FROM installment_items WHERE plan_id = ?', [id]);
        await insertItems(db, id, buildSchedule(merged));
      }
    });
    return { before, after: await findVisible(user, id) };
  },

  /** الحذف يمسح الخطّة وجدولها — العمليات اللي اتسجّلت منها تفضل كما هي */
  async remove(user, id) {
    const before = await findVisible(user, id);
    assertEditable(before, 'تحذف');
    await execute('DELETE FROM installment_plans WHERE id = ?', [id]);
    return before;
  },

  /** «دفعت» قسطًا: مصروف حقيقي بمبلغ القسط، مربوط بالصف في نفس المعاملة */
  async pay(user, planId, itemId, input = {}) {
    const plan = await findVisible(user, planId);
    assertEditable(plan, 'تسدّد');
    const item = plan.items.find((entry) => entry.id === itemId);
    if (!item) throw ApiError.notFound('القسط غير موجود');

    const label = item.seq === 0 ? 'المقدّم' : `قسط ${item.seq} من ${plan.installment_count}`;
    const result = await transaction(async (db) => {
      const row = await db.queryOne(
        'SELECT transaction_id, settled_at, amount_minor FROM installment_items WHERE id = ? AND plan_id = ? FOR UPDATE',
        [itemId, planId],
      );
      if (row.transaction_id) return { transaction: await visibleTransaction(user, row.transaction_id, db), already_paid: true };
      if (row.settled_at) throw ApiError.conflict('القسط ده متعلّم إنه اتدفع قبل كده', { code: 'ALREADY_SETTLED' });

      const created = await transactionsService.create(user, {
        type: 'expense',
        account_id: input.account_id ?? plan.account_id,
        category_id: plan.category_id,
        amount_minor: Number(row.amount_minor),
        occurred_on: input.occurred_on ?? todayIn(user.timezone),
        payee: plan.payee ?? plan.name,
        note: input.note ?? (plan.payee ? `${label} — ${plan.name}` : label),
      }, db);
      await db.execute('UPDATE installment_items SET transaction_id = ? WHERE id = ?', [created.id, itemId]);
      return { transaction: created, already_paid: false };
    });
    return { plan, item, ...result };
  },

  /** «اتدفع قبل كده» من غير عملية (أو إلغاء العلامة) */
  async settle(user, planId, itemId, { settled }) {
    const plan = await findVisible(user, planId);
    assertEditable(plan);
    const item = plan.items.find((entry) => entry.id === itemId);
    if (!item) throw ApiError.notFound('القسط غير موجود');
    if (item.status === 'paid') {
      throw ApiError.conflict('القسط ده متسجّل كعملية — احذف العملية لو عايز ترجّعه', { code: 'ALREADY_PAID' });
    }
    await execute(
      settled
        ? 'UPDATE installment_items SET settled_at = COALESCE(settled_at, NOW()), settled_by = ? WHERE id = ? AND transaction_id IS NULL'
        : 'UPDATE installment_items SET settled_at = NULL, settled_by = NULL WHERE id = ? AND transaction_id IS NULL',
      settled ? [user.id, itemId] : [itemId],
    );
    return { plan, item, after: await findVisible(user, planId) };
  },

  /** الأقساط غير المدفوعة لحدّ `to` للخطط الظاهرة. يعيد { items, active } */
  async dueItems(user, { from, to, today }) {
    const { sql, params } = visibleWhere(user);
    const unpaid = 'i.transaction_id IS NULL AND i.settled_at IS NULL';
    const [rows, active] = await Promise.all([
      query(
        `SELECT i.id AS item_id, i.seq, i.due_on, i.amount_minor, ${COLUMNS}
           ${FROM} JOIN installment_items i ON i.plan_id = p.id
          WHERE ${sql} AND ${unpaid} AND i.due_on <= ? ${from ? 'AND i.due_on >= ?' : ''}
          ORDER BY i.due_on, p.id, i.seq`,
        [...params, to, ...(from ? [from] : [])],
      ),
      queryOne(
        `SELECT COUNT(DISTINCT p.id) AS n ${FROM} JOIN installment_items i ON i.plan_id = p.id WHERE ${sql} AND ${unpaid}`,
        params,
      ),
    ]);

    const items = rows.map((row) => {
      const problem = row.account_archived_at ? 'account_archived' : row.category_archived_at ? 'category_archived' : null;
      return {
        key: `installment:${row.id}:${row.item_id}`,
        source: 'installment',
        source_id: row.id,
        item_id: row.item_id,
        due_on: row.due_on,
        name: row.name,
        type: 'expense',
        amount_minor: Number(row.amount_minor),
        payee: row.payee,
        account_id: row.account_id,
        account_name: row.account_name,
        to_account_id: null,
        to_account_name: null,
        category_id: row.category_id,
        category_name: row.category_name,
        category_icon: row.category_icon ?? row.parent_category_icon,
        category_color: row.category_color,
        frequency: 'monthly',
        interval_count: 1,
        auto_post: false,
        installment: { seq: row.seq, count: row.installment_count },
        problem,
        can_post: canRecordOn(user, { owner_user_id: row.account_owner }) && !problem,
        status: statusOf(row.due_on, today),
      };
    });
    return { items, active: active.n };
  },
};
