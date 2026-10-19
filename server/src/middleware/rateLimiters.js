/**
 * حدود المعدّل (Rate Limits).
 *
 * الحدّ العام لكل IP، وحدود أضيق للمسارات الحسّاسة: الدخول (يحمي من
 * تخمين كلمات المرور، ويكمله قفل الحساب)، واستعادة كلمة المرور، وفتح
 * حسابات جديدة (يحمي من إغراق القاعدة بأسر وهمية).
 * في الاختبارات تُعطَّل لتكون النتائج حتمية.
 */
import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

const make = ({ windowMs, limit, message, skipSuccessfulRequests = false }) => rateLimit({
  windowMs,
  limit,
  skipSuccessfulRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, _res, next) => next(ApiError.tooMany(message, { code: 'RATE_LIMITED' })),
});

export const generalLimiter = make({
  windowMs: 60_000,
  limit: 600,
  message: 'طلبات كتير في وقت قصير — استنّى شوية',
});

export const loginLimiter = make({
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: 'محاولات دخول كتير — جرّب بعد 15 دقيقة',
});

export const passwordResetLimiter = make({
  windowMs: 60 * 60_000,
  limit: 8,
  message: 'طلبات استعادة كتير — جرّب بعد ساعة',
});

export const signupLimiter = make({
  windowMs: 60 * 60_000,
  limit: 10,
  message: 'محاولات تسجيل كتير — جرّب بعد ساعة',
});
