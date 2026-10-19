/**
 * ═══════════════════════════════════════════════════════════════
 *  خدمة المصادقة — كل منطق العمل هنا؛ الـ controller لا يعرف SQL.
 *
 *  القرارات الأمنية:
 *   • توكن الدخول قصير العمر (15 دقيقة) وتوكن التجديد طويل، ويُخزَّن
 *     منه SHA-256 فقط: تسرّب القاعدة لا يعطي أحدًا جلسة.
 *   • تدوير التوكن: كل تجديد يستبدل التوكن بآخر جديد. لو ظهر توكن
 *     قديم مرّة ثانية فهذه علامة نسخة مسروقة، فنُلغي سلسلة الجلسة كلها.
 *     (نافذة سماح 10 ثوانٍ لسباق تبويبين فتحا في نفس اللحظة.)
 *   • قفل الحساب بعد محاولات فاشلة متتالية، ورسالة واحدة لأي فشل
 *     (لا نكشف هل البريد موجود)، ومقارنة وهمية تساوي الزمن.
 *   • تغيير كلمة المرور أو استعادتها يُنهي كل الجلسات الأخرى.
 * ═══════════════════════════════════════════════════════════════
 */
import crypto from 'node:crypto';
import { query, queryOne, execute, transaction, isDuplicate } from '../../config/db.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  hashPassword, verifyPassword, fakeVerifyPassword, signAccessToken,
  randomToken, sha256, expiryFromNow, ttlToMs,
} from '../../utils/security.js';
import { permissionsOf } from '../../config/permissions.js';
import { sendMail } from '../../services/mailer.js';
import { loadUser } from '../../middleware/authenticate.js';
import { createHouseholdWithOwner } from '../household/household.service.js';

const BAD_CREDENTIALS = 'البريد أو كلمة المرور غير صحيحة';
const REUSE_GRACE_MS = 10_000;

const emailTaken = () => ApiError.conflict('البريد ده مستخدم بالفعل', { code: 'EMAIL_TAKEN', details: { email: 'مستخدم بالفعل' } });

/** الشكل الذي يصل للواجهة — لا يحمل أبدًا password_hash */
export function toPublicUser(user) {
  return {
    id: user.id,
    uuid: user.uuid,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    must_change_password: Boolean(user.must_change_password),
    household: {
      id: user.household_id,
      name: user.household_name,
      currency: user.currency,
      timezone: user.timezone,
      month_start_day: user.month_start_day,
    },
    permissions: permissionsOf(user.role),
  };
}

async function issueRefreshToken(user, context, familyId = crypto.randomUUID()) {
  const token = randomToken(48);
  const ttl = context.clientType === 'web' ? env.jwt.refreshTtl : env.jwt.refreshTtlApp;
  const expiresAt = expiryFromNow(ttl);

  await execute(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, client_type, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user.id, familyId, sha256(token), context.clientType, context.userAgent || null, context.ip || null, expiresAt],
  );
  return { token, expiresAt, familyId };
}

async function startSession(user, context, familyId) {
  const refresh = await issueRefreshToken(user, context, familyId);
  return {
    user: toPublicUser(user),
    access_token: signAccessToken(user),
    expires_in: Math.floor(ttlToMs(env.jwt.accessTtl) / 1000),
    refresh,
  };
}

const revokeFamily = (familyId) =>
  execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL', [familyId]);

const revokeAllForUser = (userId) =>
  execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);

export const authService = {
  /** حساب أسرة جديد: الأسرة + صاحبها + التصنيفات المقترحة، ثم جلسة مباشرة */
  async register(input, context) {
    if (!env.signupEnabled) {
      throw ApiError.forbidden('التسجيل مقفول على النسخة دي — اطلب من صاحب الأسرة يضيفك', { code: 'SIGNUP_DISABLED' });
    }
    if (await queryOne('SELECT id FROM users WHERE email = ?', [input.email])) throw emailTaken();

    const passwordHash = await hashPassword(input.password);
    let userId;
    try {
      ({ userId } = await transaction((tx) => createHouseholdWithOwner(tx, {
        householdName: input.household_name,
        fullName: input.full_name,
        email: input.email,
        phone: input.phone,
        passwordHash,
      })));
    } catch (error) {
      // تسجيلان متزامنان بنفس البريد: القيد الفريد يحسمها
      if (isDuplicate(error, 'uq_users_email')) throw emailTaken();
      throw error;
    }
    return startSession(await loadUser(userId), context);
  },

  async login({ email, password }, context) {
    const row = await queryOne(
      'SELECT u.id, u.password_hash, u.failed_logins, u.locked_until FROM users u WHERE u.email = ? AND u.deleted_at IS NULL',
      [email],
    );

    if (!row) {
      await fakeVerifyPassword(password);
      throw ApiError.unauthorized(BAD_CREDENTIALS, { code: 'BAD_CREDENTIALS' });
    }

    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((row.locked_until.getTime() - Date.now()) / 60_000));
      throw ApiError.locked(`الحساب مقفول مؤقتًا بسبب محاولات كتير — جرّب بعد ${minutes} دقيقة`, { code: 'ACCOUNT_LOCKED' });
    }

    if (!(await verifyPassword(password, row.password_hash))) {
      const failed = row.failed_logins + 1;
      if (failed >= env.auth.maxFailedLogins) {
        await execute(
          'UPDATE users SET failed_logins = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
          [env.auth.lockMinutes, row.id],
        );
      } else {
        await execute('UPDATE users SET failed_logins = ? WHERE id = ?', [failed, row.id]);
      }
      throw ApiError.unauthorized(BAD_CREDENTIALS, { code: 'BAD_CREDENTIALS' });
    }

    const user = await loadUser(row.id);
    if (user.status !== 'active') throw ApiError.forbidden('الحساب موقوف — كلّم صاحب الأسرة', { code: 'USER_SUSPENDED' });
    if (user.household_status !== 'active') throw ApiError.forbidden('حساب الأسرة موقوف — كلّم الدعم', { code: 'HOUSEHOLD_SUSPENDED' });

    await execute('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [user.id]);
    return startSession(user, context);
  },

  async refresh(rawToken, context) {
    const record = await queryOne(
      'SELECT id, user_id, family_id, used_at, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = ?',
      [sha256(rawToken)],
    );
    if (!record) throw ApiError.unauthorized('الجلسة غير صالحة — سجّل الدخول من جديد', { code: 'SESSION_INVALID' });

    if (record.revoked_at) throw ApiError.unauthorized('الجلسة انتهت — سجّل الدخول من جديد', { code: 'SESSION_REVOKED' });

    if (record.used_at) {
      // سباق مشروع بين تبويبين؟ نمهله ولا نلغي شيئًا
      if (Date.now() - record.used_at.getTime() < REUSE_GRACE_MS) {
        throw ApiError.unauthorized('جلسة قيد التجديد — حاول تاني', { code: 'REFRESH_IN_PROGRESS' });
      }
      await revokeFamily(record.family_id);
      throw ApiError.unauthorized('الجلسة اتستخدمت من مكان تاني — سجّل الدخول من جديد', { code: 'SESSION_REUSED' });
    }

    if (record.expires_at.getTime() < Date.now()) {
      throw ApiError.unauthorized('انتهت الجلسة — سجّل الدخول من جديد', { code: 'SESSION_EXPIRED' });
    }

    const user = await loadUser(record.user_id);
    if (!user || user.status !== 'active' || user.household_status !== 'active') {
      await revokeFamily(record.family_id);
      throw ApiError.unauthorized('الحساب غير متاح', { code: 'USER_UNAVAILABLE' });
    }

    // استبدال ذرّي: ينجح لطلب واحد فقط حتى لو وصل طلبان معًا
    const claimed = await execute(
      'UPDATE refresh_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL',
      [record.id],
    );
    if (claimed.affectedRows === 0) {
      throw ApiError.unauthorized('جلسة قيد التجديد — حاول تاني', { code: 'REFRESH_IN_PROGRESS' });
    }

    return startSession(user, context, record.family_id);
  },

  /** الخروج من هذا الجهاز: نُلغي سلسلة الجلسة التي يحملها التوكن */
  async logout(rawToken) {
    if (!rawToken) return;
    const record = await queryOne('SELECT family_id FROM refresh_tokens WHERE token_hash = ?', [sha256(rawToken)]);
    if (record) await revokeFamily(record.family_id);
  },

  async logoutAll(userId) {
    await revokeAllForUser(userId);
  },

  me(user) {
    return toPublicUser(user);
  },

  async updateProfile(user, changes) {
    const fields = ['full_name', 'phone'].filter((field) => changes[field] !== undefined);
    if (fields.length > 0) {
      await execute(
        `UPDATE users SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map((field) => changes[field]), user.id],
      );
    }
    return toPublicUser(await loadUser(user.id));
  },

  /** تغيير كلمة المرور: يُنهي كل الجلسات ويفتح جلسة جديدة لهذا الجهاز */
  async changePassword(user, { current_password: current, new_password: next }, context) {
    const row = await queryOne('SELECT password_hash FROM users WHERE id = ?', [user.id]);
    if (!(await verifyPassword(current, row.password_hash))) {
      throw ApiError.badRequest('كلمة المرور الحالية غير صحيحة', {
        code: 'WRONG_PASSWORD',
        details: { current_password: 'غير صحيحة' },
      });
    }
    if (await verifyPassword(next, row.password_hash)) {
      throw ApiError.badRequest('كلمة المرور الجديدة لازم تختلف عن الحالية', {
        code: 'SAME_PASSWORD',
        details: { new_password: 'لازم تختلف عن الحالية' },
      });
    }

    await execute(
      'UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = NOW() WHERE id = ?',
      [await hashPassword(next), user.id],
    );
    await revokeAllForUser(user.id);
    return startSession(await loadUser(user.id), context);
  },

  /** دائمًا ينجح ظاهريًا — لا نكشف هل البريد مسجّل */
  async forgotPassword({ email }) {
    const user = await queryOne(
      "SELECT id, full_name, email FROM users WHERE email = ? AND status = 'active' AND deleted_at IS NULL",
      [email],
    );
    if (!user) return;

    const token = randomToken(48);
    await transaction(async (tx) => {
      await tx.execute('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [user.id]);
      await tx.execute(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
        [user.id, sha256(token)],
      );
    });
    await sendMail({
      to: user.email,
      template: 'password_reset',
      payload: { name: user.full_name, link: `${env.appUrl}/reset-password?token=${token}` },
    });
  },

  async resetPassword({ token, new_password: next }) {
    const record = await queryOne(
      'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
      [sha256(token)],
    );
    if (!record) throw ApiError.badRequest('الرابط غير صالح أو انتهت صلاحيته — اطلب رابط جديد', { code: 'RESET_INVALID' });

    const passwordHash = await hashPassword(next);
    await transaction(async (tx) => {
      await tx.execute(
        `UPDATE users SET password_hash = ?, must_change_password = 0, failed_logins = 0,
                locked_until = NULL, password_changed_at = NOW() WHERE id = ?`,
        [passwordHash, record.user_id],
      );
      await tx.execute('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [record.id]);
      await tx.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [record.user_id]);
    });
  },

  /**
   * الجلسات النشطة: صف واحد لكل سلسلة (جهاز)، ببيانات آخر تجديد فيها.
   * (المتصفّح أو الشبكة قد يتغيّران داخل نفس الجلسة، فالتجميع بهما يكرّر الجهاز.)
   */
  listSessions(userId) {
    return query(
      `SELECT f.family_id AS id, t.client_type, t.user_agent, t.ip_address, f.started_at, f.last_active_at
         FROM (SELECT family_id, MIN(created_at) AS started_at, MAX(created_at) AS last_active_at, MAX(id) AS last_id
                 FROM refresh_tokens
                WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
                GROUP BY family_id) f
         JOIN refresh_tokens t ON t.id = f.last_id
        ORDER BY f.last_active_at DESC, f.last_id DESC`,
      [userId],
    );
  },

  async revokeSession(userId, familyId) {
    const result = await execute(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND family_id = ? AND revoked_at IS NULL',
      [userId, familyId],
    );
    if (result.affectedRows === 0) throw ApiError.notFound('الجلسة غير موجودة');
  },
};
