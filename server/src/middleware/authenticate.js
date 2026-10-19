/**
 * التحقّق من هوية المستخدم عبر Access Token (ترويسة `Authorization: Bearer`).
 *
 * `authenticate`      → يرفض الطلب إن لم يكن هناك توكن صالح، ويرفض أيضًا
 *                       الحساب الذي عليه تغيير كلمة المرور (فرد جديد أُضيف
 *                       بكلمة مؤقتة) حتى يغيّرها.
 * `authenticateLoose` → نفسه لكن يسمح بالمرور في حالة تغيير كلمة المرور؛
 *                       للمسارات التي تحتاجها هذه الحالة فقط (me، تغيير
 *                       الكلمة، الخروج).
 *
 * نُحمّل المستخدم من القاعدة في كل طلب (لا نثق بالدور داخل التوكن وحده):
 * إيقاف فرد أو تغيير دوره يسري فورًا لا بعد انتهاء التوكن.
 */
import { verifyAccessToken } from '../utils/security.js';
import { queryOne } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

export const loadUser = (userId) => queryOne(
  `SELECT u.id, u.uuid, u.household_id, u.full_name, u.email, u.phone, u.role, u.status,
          u.must_change_password, u.created_at,
          h.name AS household_name, h.status AS household_status, h.currency, h.timezone, h.month_start_day
     FROM users u
     JOIN households h ON h.id = u.household_id
    WHERE u.id = ? AND u.deleted_at IS NULL`,
  [userId],
);

function makeAuthenticator({ allowPasswordChange }) {
  return asyncHandler(async (req, _res, next) => {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('لازم تسجّل الدخول للمتابعة', { code: 'NO_TOKEN' });

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (error) {
      const expired = error.name === 'TokenExpiredError';
      throw ApiError.unauthorized(
        expired ? 'انتهت الجلسة، جدّد الدخول' : 'توكن غير صالح',
        { code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' },
      );
    }

    const user = await loadUser(Number(payload.sub));
    if (!user) throw ApiError.unauthorized('الحساب غير موجود', { code: 'USER_NOT_FOUND' });
    if (user.status !== 'active') {
      throw ApiError.forbidden('الحساب موقوف — كلّم صاحب الأسرة', { code: 'USER_SUSPENDED' });
    }
    if (user.household_status !== 'active') {
      throw ApiError.forbidden('حساب الأسرة موقوف — كلّم الدعم', { code: 'HOUSEHOLD_SUSPENDED' });
    }
    if (user.must_change_password && !allowPasswordChange) {
      throw ApiError.forbidden('لازم تغيّر كلمة المرور الأول', { code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    req.user = user;
    next();
  });
}

export const authenticate = makeAuthenticator({ allowPasswordChange: false });
export const authenticateLoose = makeAuthenticator({ allowPasswordChange: true });
