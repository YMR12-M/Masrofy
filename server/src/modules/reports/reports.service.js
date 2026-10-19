/**
 * التقارير: ملخّص الشهر المالي، الاتجاه عبر الشهور، وصافي الثروة.
 *
 * كلها محسوبة على الحسابات الظاهرة للمستخدم فقط (access.js): تقرير الابن
 * عن جيبه، وتقرير صاحب الأسرة عن المشترك وحساباته الخاصّة — بلا حسابات
 * غيره الخاصّة.
 *
 * التحويلات لا تدخل الدخل والمصروف: نقل فلوس من جيب لجيب ليس صرفًا.
 */
import { query, queryOne, placeholders } from '../../config/db.js';
import { addMonths, eachDay, periodOf, periodRange } from '../../utils/dates.js';
import { ratioBps } from '../../utils/money.js';
import { visibleAccounts } from '../accounts/access.js';
import { accountsService } from '../accounts/accounts.service.js';
import { resolvePeriod } from '../budgets/budgets.service.js';

const FLOW_FROM = `FROM transactions t JOIN accounts a ON a.id = t.account_id
  WHERE t.household_id = ? AND t.type IN ('income','expense') AND t.occurred_on BETWEEN ? AND ?`;

async function totalsBetween(user, from, to) {
  const visible = visibleAccounts(user, 'a');
  const row = await queryOne(
    `SELECT COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_minor END), 0) AS income_minor,
            COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_minor END), 0) AS expense_minor
       ${FLOW_FROM} AND ${visible.sql}`,
    [user.household_id, from, to, ...visible.params],
  );
  const income = Number(row.income_minor);
  const expense = Number(row.expense_minor);
  return { income_minor: income, expense_minor: expense, net_minor: income - expense };
}

/** المجاميع لكل تصنيف رئيسي (الفروع تُضمّ لأبيها) مع حصّة كلٍّ من الإجمالي */
async function byCategory(user, from, to) {
  const visible = visibleAccounts(user, 'a');
  const rows = await query(
    `SELECT t.type, COALESCE(c.parent_id, c.id) AS category_id, SUM(t.amount_minor) AS amount_minor, COUNT(*) AS count
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN categories c ON c.id = t.category_id
      WHERE t.household_id = ? AND t.type IN ('income','expense') AND t.occurred_on BETWEEN ? AND ? AND ${visible.sql}
      GROUP BY t.type, COALESCE(c.parent_id, c.id)`,
    [user.household_id, from, to, ...visible.params],
  );
  if (rows.length === 0) return { expense: [], income: [] };

  const ids = [...new Set(rows.map((row) => row.category_id))];
  const categories = new Map((await query(
    `SELECT id, name, icon, color FROM categories WHERE id IN (${placeholders(ids.length)})`,
    ids,
  )).map((category) => [category.id, category]));

  const group = (type) => {
    const items = rows.filter((row) => row.type === type)
      .map((row) => ({ ...categories.get(row.category_id), category_id: row.category_id, amount_minor: Number(row.amount_minor), count: row.count }))
      .sort((a, b) => b.amount_minor - a.amount_minor);
    const total = items.reduce((sum, item) => sum + item.amount_minor, 0);
    return items.map(({ id: _id, ...item }) => ({ ...item, share_bps: ratioBps(item.amount_minor, total) }));
  };
  return { expense: group('expense'), income: group('income') };
}

async function daily(user, from, to) {
  const visible = visibleAccounts(user, 'a');
  const rows = await query(
    `SELECT t.occurred_on AS day,
            SUM(CASE WHEN t.type = 'income' THEN t.amount_minor ELSE 0 END) AS income_minor,
            SUM(CASE WHEN t.type = 'expense' THEN t.amount_minor ELSE 0 END) AS expense_minor
       ${FLOW_FROM} AND ${visible.sql}
      GROUP BY t.occurred_on`,
    [user.household_id, from, to, ...visible.params],
  );
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return eachDay(from, to).map((day) => ({
    date: day,
    income_minor: Number(byDay.get(day)?.income_minor ?? 0),
    expense_minor: Number(byDay.get(day)?.expense_minor ?? 0),
  }));
}

export const reportsService = {
  async summary(user, { month } = {}) {
    const period = resolvePeriod(user, month);
    const previous = periodRange(addMonths(period.month, -1), user.month_start_day);
    const [totals, previousTotals, categories, days] = await Promise.all([
      totalsBetween(user, period.from, period.to),
      totalsBetween(user, previous.from, previous.to),
      byCategory(user, period.from, period.to),
      daily(user, period.from, period.to),
    ]);
    return {
      period,
      totals: { ...totals, savings_rate_bps: totals.income_minor > 0 ? ratioBps(totals.net_minor, totals.income_minor) : null },
      previous: { ...previous, ...previousTotals },
      by_category: categories,
      daily: days,
    };
  },

  /** دخل ومصروف كل شهر مالي لآخر n شهر (الأقدم أولًا) */
  async trend(user, { months = 6, end } = {}) {
    const endKey = end ?? resolvePeriod(user).month;
    const startKey = addMonths(endKey, -(months - 1));
    const from = periodRange(startKey, user.month_start_day).from;
    const to = periodRange(endKey, user.month_start_day).to;

    const visible = visibleAccounts(user, 'a');
    const rows = await query(
      `SELECT t.occurred_on AS day, t.type, SUM(t.amount_minor) AS amount_minor
         ${FLOW_FROM} AND ${visible.sql}
        GROUP BY t.occurred_on, t.type`,
      [user.household_id, from, to, ...visible.params],
    );

    const buckets = new Map();
    for (let index = 0; index < months; index += 1) {
      const key = addMonths(startKey, index);
      buckets.set(key, { ...periodRange(key, user.month_start_day), income_minor: 0, expense_minor: 0 });
    }
    for (const row of rows) {
      const bucket = buckets.get(periodOf(row.day, user.month_start_day));
      if (bucket) bucket[`${row.type}_minor`] += Number(row.amount_minor);
    }
    return [...buckets.values()].map((bucket) => ({ ...bucket, net_minor: bucket.income_minor - bucket.expense_minor }));
  },

  /** الأصول (أرصدة موجبة) − الالتزامات (أرصدة سالبة: بطاقات وسُلف) */
  async netWorth(user) {
    const accounts = (await accountsService.list(user)).filter((account) => account.include_in_net_worth);
    const assets = accounts.filter((account) => account.balance_minor > 0).reduce((sum, account) => sum + account.balance_minor, 0);
    const liabilities = accounts.filter((account) => account.balance_minor < 0).reduce((sum, account) => sum - account.balance_minor, 0);
    return {
      assets_minor: assets,
      liabilities_minor: liabilities,
      net_minor: assets - liabilities,
      accounts: accounts.map(({ id, name, type, color, is_shared: isShared, balance_minor: balance }) => ({
        id, name, type, color, is_shared: isShared, balance_minor: balance,
      })),
    };
  },
};
