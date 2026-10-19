/**
 * الميزانيات: حدّ شهري لكل تصنيف مصروف، يتكرّر كل شهر مالي.
 *
 * • المصروف محسوب على الحسابات التي يراها المستخدم فقط (access.js)،
 *   فلا تكشف الميزانية مصروف حساب خاص لغير صاحبه.
 * • ميزانية التصنيف الرئيسي تشمل فروعه. ولو للرئيسي وأحد فروعه ميزانيتان
 *   معًا، فالإجمالي يحسب الرئيسي وحده كي لا يتكرّر نفس الجنيه مرتين.
 * • الحالة: ok تحت حدّ التنبيه · warning من حدّ التنبيه حتى 100% · over فوق الحدّ.
 */
import { query, queryOne, execute, isDuplicate } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { diffDays, periodOf, periodRange, todayIn } from '../../utils/dates.js';
import { ratioBps } from '../../utils/money.js';
import { visibleAccounts } from '../accounts/access.js';

/** الفترة المطلوبة + كم يومًا مضى منها (لمقارنة «الصرف» بـ «الوقت») */
export function resolvePeriod(user, month) {
  const today = todayIn(user.timezone);
  const period = periodRange(month ?? periodOf(today, user.month_start_day), user.month_start_day);
  const days = diffDays(period.from, period.to) + 1;
  let elapsed = days;
  if (today < period.from) elapsed = 0;
  else if (today <= period.to) elapsed = diffDays(period.from, today) + 1;
  return { ...period, days, elapsed_days: elapsed, is_current: today >= period.from && today <= period.to };
}

function statusOf(spent, amount, alertBps) {
  const used = ratioBps(spent, amount);
  if (used > 10_000) return 'over';
  if (used >= alertBps) return 'warning';
  return 'ok';
}

async function findOwn(householdId, id) {
  const row = await queryOne('SELECT * FROM budgets WHERE id = ? AND household_id = ?', [id, householdId]);
  if (!row) throw ApiError.notFound('الميزانية غير موجودة');
  return row;
}

async function assertExpenseCategory(householdId, categoryId) {
  const category = await queryOne(
    'SELECT id, kind, archived_at FROM categories WHERE id = ? AND household_id = ?',
    [categoryId, householdId],
  );
  const problem = !category ? 'غير موجود' : category.kind !== 'expense' ? 'الميزانية لتصنيفات المصروف بس' : category.archived_at ? 'مؤرشف' : null;
  if (problem) throw ApiError.unprocessable(`التصنيف ${problem}`, { code: 'VALIDATION_ERROR', details: { category_id: problem } });
}

export const budgetsService = {
  async list(user, { month } = {}) {
    const period = resolvePeriod(user, month);
    const visible = visibleAccounts(user, 'a');

    const rows = await query(
      `SELECT b.id, b.category_id, b.amount_minor, b.alert_bps,
              c.name AS category_name, c.icon AS category_icon, c.color AS category_color, c.parent_id,
              p.name AS parent_name, p.icon AS parent_icon,
              COALESCE((
                SELECT SUM(t.amount_minor)
                  FROM transactions t
                  JOIN categories tc ON tc.id = t.category_id
                  JOIN accounts a ON a.id = t.account_id
                 WHERE t.household_id = b.household_id AND t.type = 'expense'
                   AND (tc.id = b.category_id OR tc.parent_id = b.category_id)
                   AND t.occurred_on BETWEEN ? AND ?
                   AND ${visible.sql}
              ), 0) AS spent_minor
         FROM budgets b
         JOIN categories c ON c.id = b.category_id
         LEFT JOIN categories p ON p.id = c.parent_id
        WHERE b.household_id = ?
        ORDER BY COALESCE(p.sort_order, c.sort_order), COALESCE(c.parent_id, c.id), c.parent_id IS NOT NULL, c.sort_order`,
      [period.from, period.to, ...visible.params, user.household_id],
    );

    const budgets = rows.map((row) => {
      const spent = Number(row.spent_minor);
      const amount = Number(row.amount_minor);
      return {
        ...row,
        amount_minor: amount,
        spent_minor: spent,
        remaining_minor: amount - spent,
        used_bps: ratioBps(spent, amount),
        status: statusOf(spent, amount, row.alert_bps),
      };
    });

    const budgeted = new Set(budgets.map((budget) => budget.category_id));
    const counted = budgets.filter((budget) => !budget.parent_id || !budgeted.has(budget.parent_id));
    const amount = counted.reduce((total, budget) => total + budget.amount_minor, 0);
    const spent = counted.reduce((total, budget) => total + budget.spent_minor, 0);

    return {
      period,
      budgets,
      totals: { amount_minor: amount, spent_minor: spent, remaining_minor: amount - spent, used_bps: ratioBps(spent, amount) },
    };
  },

  async create(user, input) {
    await assertExpenseCategory(user.household_id, input.category_id);
    try {
      const result = await execute(
        'INSERT INTO budgets (household_id, category_id, amount_minor, alert_bps, created_by) VALUES (?, ?, ?, ?, ?)',
        [user.household_id, input.category_id, input.amount_minor, input.alert_bps ?? 8000, user.id],
      );
      return findOwn(user.household_id, result.insertId);
    } catch (error) {
      if (isDuplicate(error, 'uq_budgets_category')) {
        throw ApiError.conflict('التصنيف ده له ميزانية بالفعل — عدّلها', { code: 'BUDGET_EXISTS', details: { category_id: 'له ميزانية بالفعل' } });
      }
      throw error;
    }
  },

  async update(user, id, changes) {
    const before = await findOwn(user.household_id, id);
    const fields = ['amount_minor', 'alert_bps'].filter((field) => changes[field] !== undefined);
    if (fields.length > 0) {
      await execute(
        `UPDATE budgets SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map((field) => changes[field]), id],
      );
    }
    return { before, after: await findOwn(user.household_id, id) };
  },

  async remove(user, id) {
    const before = await findOwn(user.household_id, id);
    await execute('DELETE FROM budgets WHERE id = ?', [id]);
    return before;
  },
};
