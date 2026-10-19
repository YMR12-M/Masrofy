/**
 * ═══════════════════════════════════════════════════════════════
 *  العمليات: مصروف، دخل، وتحويل بين حسابين
 *
 *  • العملية تظهر لمن يرى أحد طرفيها. لو الطرف الآخر حساب خاص بغيره
 *    يظهر باسم «حساب خاص» فقط (تحويل من جيب الأب للبيت مثلًا).
 *  • التسجيل والتعديل والحذف يتطلّب حقّ التسجيل على **كل** حساب في
 *    العملية (القديم والجديد عند التعديل)، وألا يكون أيّهما مؤرشفًا.
 *  • التعديل يدمج التغييرات مع العملية الحالية ثم يتحقّق من الشكل الكامل،
 *    فتغيير النوع من تحويل لمصروف (أو العكس) يمرّ بنفس قواعد الإنشاء.
 * ═══════════════════════════════════════════════════════════════
 */
import { query, queryOne, execute, safeInt } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { pageMeta } from '../../utils/response.js';
import { canRecordOn, canSeeAccount, visibleAccounts } from '../accounts/access.js';

const PRIVATE_NAME = 'حساب خاص';
const EXPORT_LIMIT = 20_000;

const FROM = `
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  LEFT JOIN users u ON u.id = t.created_by`;

const COLUMNS = `t.id, t.type, t.account_id, t.to_account_id, t.category_id, t.amount_minor, t.occurred_on,
  t.payee, t.note, t.created_by, t.created_at, t.updated_at,
  a.name AS account_name, a.color AS account_color, a.owner_user_id AS account_owner, a.archived_at AS account_archived_at,
  ta.name AS to_account_name, ta.color AS to_account_color, ta.owner_user_id AS to_account_owner, ta.archived_at AS to_account_archived_at,
  c.name AS category_name, c.icon AS category_icon, c.color AS category_color, c.parent_id AS category_parent_id,
  pc.name AS parent_category_name, pc.icon AS parent_category_icon,
  u.full_name AS created_by_name`;

const side = (owner, archivedAt) => ({ owner_user_id: owner, archived_at: archivedAt });
const writable = (user, account) => canRecordOn(user, account) && !account.archived_at;

/** يخفي اسم الطرف الخاص بغير المستخدم، ويحسب هل يقدر يعدّل */
function present(user, row) {
  const from = side(row.account_owner, row.account_archived_at);
  const to = row.to_account_id ? side(row.to_account_owner, row.to_account_archived_at) : null;
  const {
    account_owner: _ao, to_account_owner: _to, account_archived_at: _aa, to_account_archived_at: _ta, ...rest
  } = row;

  const result = { ...rest, amount_minor: Number(row.amount_minor), can_edit: writable(user, from) && (!to || writable(user, to)) };
  if (!canSeeAccount(user, from)) Object.assign(result, { account_name: PRIVATE_NAME, account_color: null });
  if (to && !canSeeAccount(user, to)) Object.assign(result, { to_account_name: PRIVATE_NAME, to_account_color: null });
  return result;
}

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');

/** شرط الظهور + الفلاتر — مشترك بين القائمة والمجاميع والتصدير */
function buildWhere(user, filters = {}) {
  const fromSide = visibleAccounts(user, 'a');
  const toSide = visibleAccounts(user, 'ta');
  const where = ['t.household_id = ?', `(${fromSide.sql} OR (ta.id IS NOT NULL AND ${toSide.sql}))`];
  const params = [user.household_id, ...fromSide.params, ...toSide.params];

  if (filters.from) { where.push('t.occurred_on >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('t.occurred_on <= ?'); params.push(filters.to); }
  if (filters.type) { where.push('t.type = ?'); params.push(filters.type); }
  if (filters.account_id) { where.push('(t.account_id = ? OR t.to_account_id = ?)'); params.push(filters.account_id, filters.account_id); }
  // التصنيف الرئيسي يشمل فروعه
  if (filters.category_id) { where.push('(t.category_id = ? OR c.parent_id = ?)'); params.push(filters.category_id, filters.category_id); }
  if (filters.created_by) { where.push('t.created_by = ?'); params.push(filters.created_by); }
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    where.push('(t.payee LIKE ? OR t.note LIKE ?)');
    params.push(like, like);
  }
  return { sql: where.join(' AND '), params };
}

async function findVisible(user, id) {
  const { sql, params } = buildWhere(user);
  const row = await queryOne(`SELECT ${COLUMNS} ${FROM} WHERE t.id = ? AND ${sql}`, [id, ...params]);
  if (!row) throw ApiError.notFound('العملية غير موجودة');
  return present(user, row);
}

const fieldError = (field, message, code = 'VALIDATION_ERROR') =>
  ApiError.unprocessable(message, { code, details: { [field]: message } });

/** الحساب لازم يكون ظاهرًا ونشطًا ويحقّ للمستخدم التسجيل عليه */
async function assertRecordable(user, accountId, field) {
  const visible = visibleAccounts(user, 'a');
  const account = await queryOne(
    `SELECT a.id, a.owner_user_id, a.archived_at FROM accounts a
      WHERE a.id = ? AND a.household_id = ? AND ${visible.sql}`,
    [accountId, user.household_id, ...visible.params],
  );
  if (!account) throw fieldError(field, 'الحساب غير موجود');
  if (account.archived_at) throw ApiError.conflict('الحساب ده مؤرشف — رجّعه الأول لو عايز تسجّل عليه', { code: 'ACCOUNT_ARCHIVED', details: { [field]: 'مؤرشف' } });
  if (!canRecordOn(user, account)) throw ApiError.forbidden('مينفعش تسجّل على الحساب ده', { code: 'FORBIDDEN', details: { [field]: 'غير مسموح' } });
  return account;
}

/**
 * يتحقّق من الشكل الكامل للعملية ويعيد القيم الجاهزة للحفظ.
 * `current` عند التعديل: يسمح بالإبقاء على تصنيف أُرشف بعد التسجيل.
 */
async function resolveShape(user, data, current = null) {
  await assertRecordable(user, data.account_id, 'account_id');

  if (data.type === 'transfer') {
    if (!data.to_account_id) throw fieldError('to_account_id', 'اختار الحساب اللي هتحوّل له');
    if (data.to_account_id === data.account_id) throw fieldError('to_account_id', 'مينفعش تحوّل لنفس الحساب');
    await assertRecordable(user, data.to_account_id, 'to_account_id');
    return { ...data, category_id: null };
  }

  if (!data.category_id) throw fieldError('category_id', 'اختار التصنيف');
  const category = await queryOne(
    'SELECT id, kind, archived_at FROM categories WHERE id = ? AND household_id = ?',
    [data.category_id, user.household_id],
  );
  if (!category) throw fieldError('category_id', 'التصنيف غير موجود');
  if (category.kind !== data.type) {
    throw fieldError('category_id', data.type === 'expense' ? 'التصنيف ده للدخل مش للمصروف' : 'التصنيف ده للمصروف مش للدخل');
  }
  if (category.archived_at && current?.category_id !== category.id) throw fieldError('category_id', 'التصنيف ده مؤرشف');
  return { ...data, to_account_id: null };
}

const SAVED_FIELDS = ['type', 'account_id', 'to_account_id', 'category_id', 'amount_minor', 'occurred_on', 'payee', 'note'];

export const transactionsService = {
  async list(user, filters) {
    const { sql, params } = buildWhere(user, filters);
    const pageSize = safeInt(filters.page_size, { min: 1, max: 100, fallback: 25 });
    const page = safeInt(filters.page, { min: 1, max: 100_000, fallback: 1 });

    const [rows, summary] = await Promise.all([
      query(
        `SELECT ${COLUMNS} ${FROM} WHERE ${sql}
          ORDER BY t.occurred_on DESC, t.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params,
      ),
      queryOne(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_minor END), 0) AS income_minor,
                COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_minor END), 0) AS expense_minor
           ${FROM} WHERE ${sql}`,
        params,
      ),
    ]);

    return {
      rows: rows.map((row) => present(user, row)),
      meta: {
        ...pageMeta(page, pageSize, summary.total),
        totals: { income_minor: Number(summary.income_minor), expense_minor: Number(summary.expense_minor) },
      },
    };
  },

  /** كل العمليات المطابقة (بحدّ أقصى) للتصدير */
  async exportRows(user, filters) {
    const { sql, params } = buildWhere(user, filters);
    const rows = await query(
      `SELECT ${COLUMNS} ${FROM} WHERE ${sql} ORDER BY t.occurred_on, t.id LIMIT ${EXPORT_LIMIT}`,
      params,
    );
    return rows.map((row) => present(user, row));
  },

  find: findVisible,

  async create(user, input) {
    const data = await resolveShape(user, input);
    const result = await execute(
      `INSERT INTO transactions (household_id, ${SAVED_FIELDS.join(', ')}, created_by, updated_by)
       VALUES (?, ${SAVED_FIELDS.map(() => '?').join(', ')}, ?, ?)`,
      [user.household_id, ...SAVED_FIELDS.map((field) => data[field] ?? null), user.id, user.id],
    );
    return findVisible(user, result.insertId);
  },

  async update(user, id, changes) {
    const before = await findVisible(user, id);
    if (!before.can_edit) throw ApiError.forbidden('مينفعش تعدّل العملية دي', { code: 'FORBIDDEN' });

    const merged = Object.fromEntries(SAVED_FIELDS.map((field) => [field, changes[field] !== undefined ? changes[field] : before[field]]));
    const data = await resolveShape(user, merged, before);
    await execute(
      `UPDATE transactions SET ${SAVED_FIELDS.map((field) => `${field} = ?`).join(', ')}, updated_by = ? WHERE id = ?`,
      [...SAVED_FIELDS.map((field) => data[field] ?? null), user.id, id],
    );
    return { before, after: await findVisible(user, id) };
  },

  async remove(user, id) {
    const before = await findVisible(user, id);
    if (!before.can_edit) throw ApiError.forbidden('مينفعش تحذف العملية دي', { code: 'FORBIDDEN' });
    await execute('DELETE FROM transactions WHERE id = ?', [id]);
    return before;
  },
};
