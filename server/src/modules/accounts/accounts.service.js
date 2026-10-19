/**
 * الحسابات (كاش، بنك، محفظة، بطاقة، ادخار) وأرصدتها.
 *
 * الرصيد = الرصيد الافتتاحي + الدخل − المصروف − التحويل الخارج + التحويل الداخل.
 * يُحسب في نفس الاستعلام (BALANCE_SQL) ولا يُخزَّن، فلا يختلف أبدًا عن العمليات.
 */
import { query, queryOne, execute, isDuplicate } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { can } from '../../config/permissions.js';
import { canManageAccount, canRecordOn, visibleAccounts } from './access.js';

/**
 * رصيد الحساب `a` بالقروش. amount_minor بلا إشارة (UNSIGNED)، فنحوّله SIGNED
 * قبل الطرح وإلا رفضت MySQL الناتج السالب.
 */
export const BALANCE_SQL = `(a.opening_balance_minor
  + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN CAST(t.amount_minor AS SIGNED) ELSE -CAST(t.amount_minor AS SIGNED) END)
                FROM transactions t WHERE t.account_id = a.id), 0)
  + COALESCE((SELECT SUM(t.amount_minor) FROM transactions t WHERE t.to_account_id = a.id), 0))`;

const COLUMNS = `a.id, a.owner_user_id, a.name, a.type, a.institution, a.opening_balance_minor,
  a.credit_limit_minor, a.color, a.include_in_net_worth, a.sort_order, a.archived_at,
  a.created_at, a.updated_at, o.full_name AS owner_name`;

/** يضيف ما تحتاجه الواجهة لتقرّر الأزرار، ويحوّل أعلام MySQL (0/1) إلى منطقية */
function present(user, row) {
  return {
    ...row,
    balance_minor: Number(row.balance_minor),
    include_in_net_worth: Boolean(row.include_in_net_worth),
    is_shared: row.owner_user_id === null,
    can_manage: canManageAccount(user, row),
    can_record: canRecordOn(user, row) && !row.archived_at,
  };
}

const nameTaken = () => ApiError.conflict('عندك حساب نشط بنفس الاسم', { code: 'NAME_TAKEN', details: { name: 'مستخدم بالفعل' } });

async function findVisible(user, id) {
  const visible = visibleAccounts(user);
  const row = await queryOne(
    `SELECT ${COLUMNS}, ${BALANCE_SQL} AS balance_minor
       FROM accounts a LEFT JOIN users o ON o.id = a.owner_user_id
      WHERE a.id = ? AND a.household_id = ? AND ${visible.sql}`,
    [id, user.household_id, ...visible.params],
  );
  if (!row) throw ApiError.notFound('الحساب غير موجود');
  return present(user, row);
}

export const accountsService = {
  async list(user, { include_archived: includeArchived = false } = {}) {
    const visible = visibleAccounts(user);
    const rows = await query(
      `SELECT ${COLUMNS}, ${BALANCE_SQL} AS balance_minor
         FROM accounts a LEFT JOIN users o ON o.id = a.owner_user_id
        WHERE a.household_id = ? AND ${visible.sql} ${includeArchived ? '' : 'AND a.archived_at IS NULL'}
        ORDER BY a.archived_at IS NOT NULL, a.sort_order, a.id`,
      [user.household_id, ...visible.params],
    );
    return rows.map((row) => present(user, row));
  },

  find: findVisible,

  /** scope: 'shared' (مشترك) أو 'private' (خاص بمن أنشأه) */
  async create(user, input) {
    const shared = input.scope === 'shared';
    if (shared && !can(user.role, 'accounts.manage')) {
      throw ApiError.forbidden('إضافة حساب مشترك لصاحب الأسرة أو المشرف — تقدر تضيف حساب خاص بيك', { code: 'FORBIDDEN' });
    }
    if (!shared && !can(user.role, 'accounts.own')) throw ApiError.forbidden();

    try {
      const result = await execute(
        `INSERT INTO accounts (household_id, owner_user_id, name, type, institution, opening_balance_minor,
                               credit_limit_minor, color, include_in_net_worth, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.household_id, shared ? null : user.id, input.name, input.type, input.institution ?? null,
          input.opening_balance_minor ?? 0, input.credit_limit_minor ?? null, input.color ?? '#0d6b57',
          input.include_in_net_worth ?? true, input.sort_order ?? 0, user.id],
      );
      return findVisible(user, result.insertId);
    } catch (error) {
      if (isDuplicate(error, 'uq_accounts_name')) throw nameTaken();
      throw error;
    }
  },

  async update(user, id, changes) {
    const before = await findVisible(user, id);
    if (!before.can_manage) throw ApiError.forbidden('مينفعش تعدّل الحساب ده', { code: 'FORBIDDEN' });

    const fields = ['name', 'type', 'institution', 'opening_balance_minor', 'credit_limit_minor', 'color', 'include_in_net_worth', 'sort_order']
      .filter((field) => changes[field] !== undefined);
    const sets = fields.map((field) => `${field} = ?`);
    const params = fields.map((field) => changes[field]);
    // إعادة حساب مؤرشف للخدمة، أو أرشفته
    if (changes.archived !== undefined) sets.push(changes.archived ? 'archived_at = COALESCE(archived_at, NOW())' : 'archived_at = NULL');

    if (sets.length > 0) {
      try {
        await execute(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      } catch (error) {
        if (isDuplicate(error, 'uq_accounts_name')) throw nameTaken();
        throw error;
      }
    }
    return { before, after: await findVisible(user, id) };
  },

  /** حساب بلا عمليات يُحذف فعلًا، ومَن له عمليات يُؤرشَف (تاريخه يفضل في التقارير) */
  async remove(user, id) {
    const account = await findVisible(user, id);
    if (!account.can_manage) throw ApiError.forbidden('مينفعش تحذف الحساب ده', { code: 'FORBIDDEN' });

    const { n } = await queryOne(
      'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?',
      [id, id],
    );
    if (n === 0) {
      await execute('DELETE FROM accounts WHERE id = ?', [id]);
      return { before: account, archived: false };
    }
    await execute('UPDATE accounts SET archived_at = COALESCE(archived_at, NOW()) WHERE id = ?', [id]);
    return { before: account, archived: true };
  },
};
