/**
 * التصنيفات: شجرة من مستويين لكل نوع (مصروف / دخل).
 *
 * • تصنيف بلا أي استخدام يُحذف فعلًا. المستخدم في عمليات أو ميزانيات أو له
 *   فروع يُؤرشَف مع فروعه (التقارير القديمة تحتاج اسمه)، وتُشال ميزانياته.
 * • لا يتغيّر نوع التصنيف بعد إنشائه: كان سيحوّل مصروفات قديمة إلى دخل.
 */
import { query, queryOne, execute, transaction, isDuplicate } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';

const COLUMNS = 'c.id, c.parent_id, c.kind, c.name, c.icon, c.color, c.sort_order, c.archived_at, c.created_at';

const nameTaken = () => ApiError.conflict('فيه تصنيف بنفس الاسم في نفس المكان', { code: 'NAME_TAKEN', details: { name: 'مستخدم بالفعل' } });

async function find(householdId, id) {
  const row = await queryOne(`SELECT ${COLUMNS} FROM categories c WHERE c.id = ? AND c.household_id = ?`, [id, householdId]);
  if (!row) throw ApiError.notFound('التصنيف غير موجود');
  return row;
}

/** الأب لازم: من نفس الأسرة والنوع، رئيسي (لا أحفاد)، ونشط */
async function assertValidParent(householdId, parentId, kind, selfId = null) {
  if (parentId === selfId) throw ApiError.badRequest('التصنيف مينفعش يكون أب لنفسه', { code: 'BAD_PARENT', details: { parent_id: 'غير صالح' } });
  const parent = await queryOne(
    'SELECT id, kind, parent_id, archived_at FROM categories WHERE id = ? AND household_id = ?',
    [parentId, householdId],
  );
  const problem = !parent ? 'غير موجود'
    : parent.kind !== kind ? 'نوعه مختلف'
      : parent.parent_id !== null ? 'لازم يكون تصنيف رئيسي'
        : parent.archived_at ? 'مؤرشف' : null;
  if (problem) throw ApiError.badRequest(`التصنيف الرئيسي ${problem}`, { code: 'BAD_PARENT', details: { parent_id: problem } });
}

export const categoriesService = {
  /** قائمة مسطّحة مرتّبة: الرئيسي ثم فروعه (الواجهة تبني الشجرة) */
  list(householdId, { kind, include_archived: includeArchived = false } = {}) {
    const where = ['c.household_id = ?'];
    const params = [householdId];
    if (kind) { where.push('c.kind = ?'); params.push(kind); }
    if (!includeArchived) where.push('c.archived_at IS NULL');
    return query(
      `SELECT ${COLUMNS} FROM categories c
         LEFT JOIN categories p ON p.id = c.parent_id
        WHERE ${where.join(' AND ')}
        ORDER BY c.kind, COALESCE(p.sort_order, c.sort_order), COALESCE(c.parent_id, c.id), c.parent_id IS NOT NULL, c.sort_order, c.name`,
      params,
    );
  },

  find,

  async create(householdId, input) {
    if (input.parent_id) await assertValidParent(householdId, input.parent_id, input.kind);
    try {
      const result = await execute(
        `INSERT INTO categories (household_id, parent_id, kind, name, icon, color, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [householdId, input.parent_id ?? null, input.kind, input.name, input.icon ?? null, input.color ?? '#57534e', input.sort_order ?? 0],
      );
      return find(householdId, result.insertId);
    } catch (error) {
      if (isDuplicate(error, 'uq_categories_name')) throw nameTaken();
      throw error;
    }
  },

  async update(householdId, id, changes) {
    const before = await find(householdId, id);

    if (changes.parent_id !== undefined && changes.parent_id !== before.parent_id) {
      if (changes.parent_id !== null) {
        await assertValidParent(householdId, changes.parent_id, before.kind, id);
        const { n } = await queryOne('SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?', [id]);
        if (n > 0) throw ApiError.badRequest('التصنيف ده له فروع — مينفعش يبقى فرعي', { code: 'HAS_CHILDREN', details: { parent_id: 'له فروع' } });
      }
    }
    if (changes.archived === false && before.parent_id) {
      const parent = await find(householdId, before.parent_id);
      if (parent.archived_at) throw ApiError.badRequest('رجّع التصنيف الرئيسي الأول', { code: 'PARENT_ARCHIVED' });
    }

    const fields = ['name', 'icon', 'color', 'sort_order', 'parent_id'].filter((field) => changes[field] !== undefined);
    const sets = fields.map((field) => `${field} = ?`);
    const params = fields.map((field) => changes[field]);
    if (changes.archived === false) sets.push('archived_at = NULL');

    if (sets.length > 0) {
      try {
        await execute(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      } catch (error) {
        if (isDuplicate(error, 'uq_categories_name')) throw nameTaken();
        throw error;
      }
    }
    if (changes.archived === true) await this.archive(id);
    return { before, after: await find(householdId, id) };
  },

  /** أرشفة مع الفروع، وشيل ميزانياتها (لا معنى لحدّ على تصنيف مقفول) */
  archive(id) {
    return transaction(async (tx) => {
      const ids = [id, ...(await tx.query('SELECT id FROM categories WHERE parent_id = ?', [id])).map((row) => row.id)];
      const marks = ids.map(() => '?').join(',');
      await tx.execute(`UPDATE categories SET archived_at = COALESCE(archived_at, NOW()) WHERE id IN (${marks})`, ids);
      await tx.execute(`DELETE FROM budgets WHERE category_id IN (${marks})`, ids);
    });
  },

  async remove(householdId, id) {
    const before = await find(householdId, id);
    const usage = await queryOne(
      `SELECT (SELECT COUNT(*) FROM transactions WHERE category_id = ?)
            + (SELECT COUNT(*) FROM budgets WHERE category_id = ?)
            + (SELECT COUNT(*) FROM categories WHERE parent_id = ?)
            + (SELECT COUNT(*) FROM recurring_rules WHERE category_id = ?)
            + (SELECT COUNT(*) FROM installment_plans WHERE category_id = ?) AS n`,
      [id, id, id, id, id],
    );
    if (usage.n === 0) {
      await execute('DELETE FROM categories WHERE id = ?', [id]);
      return { before, archived: false };
    }
    await this.archive(id);
    return { before, archived: true };
  },
};
