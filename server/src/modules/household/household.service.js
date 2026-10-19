/**
 * الأسرة: إنشاؤها مع صاحبها، وقراءة إعداداتها وتعديلها.
 *
 * `createHouseholdWithOwner` مشتركة بين التسجيل من الواجهة وسكربت
 * `db:bootstrap`، فيبدأ الطريقان بنفس الحالة بالظبط (أسرة + صاحبها +
 * التصنيفات المقترحة).
 */
import crypto from 'node:crypto';
import { execute, queryOne } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { seedDefaultCategories } from '../../config/defaultCategories.js';

const COLUMNS = 'h.id, h.uuid, h.name, h.currency, h.timezone, h.month_start_day, h.created_at';

/**
 * داخل معاملة: أسرة + صاحبها + التصنيفات المقترحة.
 * @returns {Promise<{ householdId: number, userId: number }>}
 */
export async function createHouseholdWithOwner(tx, { householdName, fullName, email, phone, passwordHash }) {
  const household = await tx.execute(
    'INSERT INTO households (uuid, name) VALUES (?, ?)',
    [crypto.randomUUID(), householdName],
  );
  const user = await tx.execute(
    `INSERT INTO users (uuid, household_id, full_name, email, phone, password_hash, role, password_changed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'owner', NOW())`,
    [crypto.randomUUID(), household.insertId, fullName, email, phone ?? null, passwordHash],
  );
  await seedDefaultCategories(tx, household.insertId);
  return { householdId: household.insertId, userId: user.insertId };
}

export const householdService = {
  async get(householdId) {
    const household = await queryOne(
      `SELECT ${COLUMNS},
              (SELECT COUNT(*) FROM users u WHERE u.household_id = h.id AND u.deleted_at IS NULL) AS members_count
         FROM households h WHERE h.id = ?`,
      [householdId],
    );
    if (!household) throw ApiError.notFound('الأسرة غير موجودة');
    return household;
  },

  async update(householdId, changes) {
    const before = await this.get(householdId);
    const fields = ['name', 'currency', 'timezone', 'month_start_day'].filter((field) => changes[field] !== undefined);
    if (fields.length > 0) {
      await execute(
        `UPDATE households SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map((field) => changes[field]), householdId],
      );
    }
    return { before, after: await this.get(householdId) };
  },
};
