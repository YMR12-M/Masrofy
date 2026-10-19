/**
 * أفراد الأسرة.
 *
 * القواعد التي تحمي الأسرة من نفسها:
 *   • صاحب الأسرة وحده يضيف صاحبًا آخر أو يعدّل حساب صاحب.
 *   • لا يُخفَّض ولا يُوقَف ولا يُحذَف آخر صاحب نشط (وإلا تُقفَل الأسرة).
 *   • لا يعدّل الفرد دوره أو حالته بنفسه (يمنع إقصاء النفس بالخطأ).
 *   • حذف فرد يؤرشف حساباته الخاصّة كما هي: لا تنتقل لأحد ولا تُكشف.
 */
import crypto from 'node:crypto';
import { execute, query, queryOne, transaction, isDuplicate } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { can } from '../../config/permissions.js';
import { generateTempPassword, hashPassword } from '../../utils/security.js';

const PUBLIC_COLUMNS = 'u.id, u.full_name, u.role, u.status';
const FULL_COLUMNS = `${PUBLIC_COLUMNS}, u.email, u.phone, u.must_change_password, u.last_login_at, u.created_at`;

const normalize = (user) => ({ ...user, must_change_password: user.must_change_password === undefined ? undefined : Boolean(user.must_change_password) });

async function findInHousehold(householdId, userId) {
  const user = await queryOne(
    `SELECT ${FULL_COLUMNS} FROM users u WHERE u.id = ? AND u.household_id = ? AND u.deleted_at IS NULL`,
    [userId, householdId],
  );
  if (!user) throw ApiError.notFound('الفرد غير موجود');
  return normalize(user);
}

const countActiveOwners = async (householdId, exceptUserId = 0) =>
  (await queryOne(
    `SELECT COUNT(*) AS n FROM users
      WHERE household_id = ? AND role = 'owner' AND status = 'active' AND deleted_at IS NULL AND id <> ?`,
    [householdId, exceptUserId],
  )).n;

function assertCanTouch(actor, target) {
  if (target.role === 'owner' && actor.role !== 'owner') {
    throw ApiError.forbidden('صاحب الأسرة وحده يعدّل حساب صاحب', { code: 'OWNER_ONLY' });
  }
}

export const membersService = {
  /** الكل يرى أسماء الأسرة (لمعرفة مَن سجّل العملية)، والمشرف وحده يرى البريد والهاتف */
  async list(actor) {
    const columns = can(actor.role, 'household.manage') ? FULL_COLUMNS : PUBLIC_COLUMNS;
    const rows = await query(
      `SELECT ${columns} FROM users u
        WHERE u.household_id = ? AND u.deleted_at IS NULL
        ORDER BY FIELD(u.role, 'owner', 'admin', 'member', 'child', 'viewer'), u.full_name`,
      [actor.household_id],
    );
    return rows.map(normalize);
  },

  get: (actor, id) => findInHousehold(actor.household_id, id),

  async create(actor, payload) {
    if (payload.role === 'owner' && actor.role !== 'owner') {
      throw ApiError.forbidden('صاحب الأسرة وحده يضيف صاحبًا', { code: 'OWNER_ONLY' });
    }
    if (await queryOne('SELECT id FROM users WHERE email = ?', [payload.email])) {
      throw ApiError.conflict('البريد ده مستخدم بالفعل', { code: 'EMAIL_TAKEN', details: { email: 'مستخدم بالفعل' } });
    }

    const plain = payload.password || generateTempPassword();
    let result;
    try {
      result = await execute(
        `INSERT INTO users (uuid, household_id, full_name, email, phone, password_hash, role, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [crypto.randomUUID(), actor.household_id, payload.full_name, payload.email, payload.phone ?? null, await hashPassword(plain), payload.role],
      );
    } catch (error) {
      if (isDuplicate(error, 'uq_users_email')) {
        throw ApiError.conflict('البريد ده مستخدم بالفعل', { code: 'EMAIL_TAKEN', details: { email: 'مستخدم بالفعل' } });
      }
      throw error;
    }

    const member = await findInHousehold(actor.household_id, result.insertId);
    // الكلمة المؤقتة تُعرض مرّة واحدة هنا ولا تُخزَّن بنص صريح في أي مكان
    return { member, temp_password: payload.password ? null : plain };
  },

  async update(actor, id, changes) {
    const target = await findInHousehold(actor.household_id, id);
    assertCanTouch(actor, target);

    const touchesRole = changes.role !== undefined && changes.role !== target.role;
    const touchesStatus = changes.status !== undefined && changes.status !== target.status;

    if (id === actor.id && (touchesRole || touchesStatus)) {
      throw ApiError.forbidden('مينفعش تغيّر دورك أو حالتك بنفسك', { code: 'SELF_CHANGE' });
    }
    if (changes.role === 'owner' && actor.role !== 'owner') {
      throw ApiError.forbidden('صاحب الأسرة وحده يرقّي لصاحب', { code: 'OWNER_ONLY' });
    }
    const losesOwnership = target.role === 'owner'
      && ((touchesRole && changes.role !== 'owner') || changes.status === 'suspended');
    if (losesOwnership && (await countActiveOwners(actor.household_id, id)) === 0) {
      throw ApiError.conflict('لازم يفضل صاحب نشط واحد على الأقل', { code: 'LAST_OWNER' });
    }

    await transaction(async (tx) => {
      const fields = ['full_name', 'phone', 'role', 'status'].filter((field) => changes[field] !== undefined);
      if (fields.length > 0) {
        await tx.execute(
          `UPDATE users SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
          [...fields.map((field) => changes[field]), id],
        );
      }
      // إيقاف الحساب أو تغيير دوره يُنهي جلساته فورًا
      if (changes.status === 'suspended' || touchesRole) {
        await tx.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
      }
    });

    return { before: target, after: await findInHousehold(actor.household_id, id) };
  },

  async remove(actor, id) {
    const target = await findInHousehold(actor.household_id, id);
    assertCanTouch(actor, target);
    if (id === actor.id) throw ApiError.forbidden('مينفعش تحذف حسابك', { code: 'SELF_DELETE' });
    if (target.role === 'owner' && (await countActiveOwners(actor.household_id, id)) === 0) {
      throw ApiError.conflict('مينفعش تحذف آخر صاحب للأسرة', { code: 'LAST_OWNER' });
    }

    await transaction(async (tx) => {
      // نحرّر البريد (UNIQUE) ليُستخدم لحساب جديد، ونُبقي الصفّ لسلامة السجلات التاريخية
      await tx.execute(
        `UPDATE users SET deleted_at = NOW(), status = 'suspended',
                email = LEFT(CONCAT('deleted-', id, '-', email), 190)
          WHERE id = ?`,
        [id],
      );
      await tx.execute('UPDATE accounts SET archived_at = NOW() WHERE owner_user_id = ? AND archived_at IS NULL', [id]);
      await tx.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
    });
    return target;
  },

  /** كلمة مرور مؤقتة جديدة تُعرض مرّة واحدة (لفرد نسي ولا يصله البريد) */
  async issueTempPassword(actor, id) {
    const target = await findInHousehold(actor.household_id, id);
    assertCanTouch(actor, target);
    if (id === actor.id) throw ApiError.forbidden('غيّر كلمة مرورك من الإعدادات', { code: 'SELF_CHANGE' });

    const plain = generateTempPassword();
    await transaction(async (tx) => {
      await tx.execute(
        'UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?',
        [await hashPassword(plain), id],
      );
      await tx.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
    });
    return { member: target, temp_password: plain };
  },
};
