import { z } from 'zod';
import {
  idSchema, isoDate, minorAmount, optionalText, positiveMinor, requiredText,
} from '../../utils/schemas.js';

const sensibleDate = isoDate.refine((value) => value >= '2000-01-01' && value <= '2100-12-31', 'التاريخ خارج المدى المعقول');

const fields = {
  name: requiredText(80),
  account_id: idSchema,
  category_id: idSchema,
  payee: optionalText(120),
  note: optionalText(500),
  // الإجمالي اللي هيتدفع فعلًا (بالفوايد لو فيه) = المقدّم + الأقساط
  total_minor: positiveMinor,
  down_payment_minor: minorAmount,
  installment_count: z.number().int().min(1, 'قسط واحد على الأقل').max(120, 'أقصى حاجة 120 قسط'),
  purchase_on: sensibleDate,
  first_due_on: sensibleDate,
};

/** حقول الجدول: تغييرها يعيد توليد الأقساط (مسموح بس لو مفيش حاجة اتدفعت) */
export const SCHEDULE_FIELDS = ['total_minor', 'down_payment_minor', 'installment_count', 'purchase_on', 'first_due_on'];

/**
 * قواعد الجدول المشتركة بين الإنشاء والتعديل بعد الدمج.
 * يعيد { field: message } أو null.
 */
export function scheduleProblem(data) {
  if (data.down_payment_minor >= data.total_minor) return { down_payment_minor: 'المقدّم لازم أقل من الإجمالي' };
  if (data.total_minor - data.down_payment_minor < data.installment_count) return { installment_count: 'الأقساط أكتر من المبلغ الباقي' };
  if (data.purchase_on > data.first_due_on) return { first_due_on: 'أول قسط قبل يوم الشراء' };
  return null;
}

export const createPlanSchema = z.object({
  ...fields,
  down_payment_minor: fields.down_payment_minor.optional(),
  purchase_on: fields.purchase_on.optional(),
}).superRefine((data, ctx) => {
  const problem = scheduleProblem({
    ...data,
    down_payment_minor: data.down_payment_minor ?? 0,
    purchase_on: data.purchase_on ?? data.first_due_on,
  });
  for (const [field, message] of Object.entries(problem ?? {})) ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [field] });
});

export const updatePlanSchema = z.object(fields).partial().strict();

export const itemParams = z.object({ id: idSchema, itemId: idSchema });

/** سداد قسط: مبلغه ثابت من الجدول، والتاريخ والحساب يتغيّروا للمرة دي */
export const payItemSchema = z.object({
  occurred_on: sensibleDate.optional(),
  account_id: idSchema.optional(),
  note: optionalText(500),
}).strict();

/** علامة «اتدفع من غير تسجيل» أو إلغاؤها */
export const settleItemSchema = z.object({ settled: z.boolean() }).strict();
