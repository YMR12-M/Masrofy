import { z } from 'zod';
import {
  idSchema, isoDate, optionalText, positiveMinor, requiredText,
} from '../../utils/schemas.js';
import { TRANSACTION_TYPES } from '../transactions/transactions.validation.js';

export const FREQUENCIES = ['weekly', 'monthly', 'yearly'];

/** تاريخ عاقل (نفس حدود العمليات) */
const sensibleDate = isoDate.refine((value) => value >= '2000-01-01' && value <= '2100-12-31', 'التاريخ خارج المدى المعقول');

const fields = {
  name: requiredText(80),
  type: z.enum(TRANSACTION_TYPES),
  account_id: idSchema,
  to_account_id: idSchema.nullable(),
  category_id: idSchema.nullable(),
  amount_minor: positiveMinor,
  payee: optionalText(120),
  note: optionalText(500),
  frequency: z.enum(FREQUENCIES),
  interval_count: z.number().int().min(1, 'أقل حاجة 1').max(52, 'أقصى حاجة 52'),
  start_on: sensibleDate,
  end_on: sensibleDate.nullable(),
  total_count: z.number().int().min(1, 'مرة واحدة على الأقل').max(1000, 'أقصى حاجة 1000 مرة').nullable(),
  auto_post: z.boolean(),
};

/** النهاية لا تسبق أول معاد — تُفحص هنا للإنشاء، وفي الخدمة بعد الدمج للتعديل */
export const endAfterStart = (data) => !data.end_on || !data.start_on || data.end_on >= data.start_on;
const END_MESSAGE = { message: 'تاريخ النهاية قبل أول معاد', path: ['end_on'] };

export const createRecurringSchema = z.object({
  ...fields,
  to_account_id: fields.to_account_id.optional(),
  category_id: fields.category_id.optional(),
  interval_count: fields.interval_count.optional(),
  end_on: fields.end_on.optional(),
  total_count: fields.total_count.optional(),
  auto_post: fields.auto_post.optional(),
}).refine(endAfterStart, END_MESSAGE);

export const updateRecurringSchema = z.object(fields).partial().strict();

/** تسجيل معاد: الافتراضي مبلغ القاعدة وحسابها و«النهارده» — ويُسمح بتغييرها للمرة دي */
export const postOccurrenceSchema = z.object({
  due_on: isoDate,
  occurred_on: sensibleDate.optional(),
  amount_minor: positiveMinor.optional(),
  account_id: idSchema.optional(),
  note: optionalText(500),
}).strict();

export const skipOccurrenceSchema = z.object({ due_on: isoDate }).strict();
