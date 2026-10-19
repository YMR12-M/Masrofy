/**
 * ═══════════════════════════════════════════════════════════════
 *  لبنات سكيما Zod المشتركة
 *
 *  قاعدة: لا transform يحوّل undefined إلى null هنا — وإلا فكل PATCH
 *  كان سيمسح الحقول التي لم يُرسلها العميل. النصّ الفارغ فقط يتحوّل
 *  إلى null، والحقل الغائب يبقى غائبًا.
 * ═══════════════════════════════════════════════════════════════
 */
import { z } from 'zod';
import '../config/zod.js';
import { isValidIso, isValidMonth } from './dates.js';
import { normalizePhone } from './phone.js';
import { passwordIssues } from './security.js';

export const idSchema = z.coerce.number().int().positive();

/** idParams('id') ← سكيما لـ req.params */
export const idParams = (...names) =>
  z.object(Object.fromEntries((names.length ? names : ['id']).map((name) => [name, idSchema])));

export const isoDate = z.string().refine(isValidIso, 'التاريخ لازم بصيغة YYYY-MM-DD وصالح');

/** شهر مالي: YYYY-MM */
export const monthKey = z.string().refine(isValidMonth, 'الشهر لازم بصيغة YYYY-MM');

const MAX_MINOR = 100_000_000_000; // مليار جنيه — حدّ عاقل يمنع الأرقام العبثية

/** المبالغ بالقروش — أعداد صحيحة */
export const minorAmount = z.number().int('المبلغ بالقروش — عدد صحيح').min(0).max(MAX_MINOR);
export const positiveMinor = z.number().int('المبلغ بالقروش — عدد صحيح').min(1, 'المبلغ لازم أكبر من صفر').max(MAX_MINOR);
export const signedMinor = z.number().int('المبلغ بالقروش — عدد صحيح').min(-MAX_MINOR).max(MAX_MINOR);

export const emailSchema = z.string().trim().toLowerCase().email().max(190);

export const phoneSchema = z.string().trim().min(7).max(30)
  .transform((value) => normalizePhone(value))
  .refine((value) => value && value.replace(/\D/g, '').length >= 7, 'رقم هاتف غير صالح');

/** هاتف اختياري: الفارغ ← null */
export const optionalPhone = z.union([phoneSchema, z.literal('').transform(() => null), z.null()]).optional();

export const passwordSchema = z.string().max(128).superRefine((value, ctx) => {
  const issues = passwordIssues(value);
  if (issues.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `كلمة المرور لازم: ${issues.join('، ')}` });
  }
});

/** لون بصيغة #RRGGBB */
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'اللون بصيغة #RRGGBB');

/** نصّ اختياري: الفارغ ← null، والغائب يبقى غائبًا */
export const optionalText = (max = 500) =>
  z.string().trim().max(max).transform((value) => (value === '' ? null : value)).nullish();

export const requiredText = (max = 190) => z.string().trim().min(1).max(max);

export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

/** قيمة منطقية قادمة من query string ("true" / "1") أو JSON */
export const boolish = z.union([
  z.boolean(),
  z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1'),
]);

/** مدى تواريخ: to بعد from */
export const dateRangeRefine = (data) => !data.from || !data.to || data.to >= data.from;
