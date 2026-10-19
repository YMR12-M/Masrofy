import { z } from 'zod';
import {
  dateRangeRefine, idSchema, isoDate, optionalText, pagingSchema, positiveMinor,
} from '../../utils/schemas.js';

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'];

/** تاريخ عاقل: يمنع خطأ كتابة سنة 0202 أو 2620 */
const occurredOn = isoDate.refine((value) => value >= '2000-01-01' && value <= '2100-12-31', 'التاريخ خارج المدى المعقول');

const fields = {
  type: z.enum(TRANSACTION_TYPES),
  account_id: idSchema,
  to_account_id: idSchema.nullable(),
  category_id: idSchema.nullable(),
  amount_minor: positiveMinor,
  occurred_on: occurredOn,
  payee: optionalText(120),
  note: optionalText(500),
};

export const createTransactionSchema = z.object({
  ...fields,
  to_account_id: fields.to_account_id.optional(),
  category_id: fields.category_id.optional(),
});

export const updateTransactionSchema = z.object(fields).partial().strict();

const filters = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  account_id: idSchema.optional(),
  category_id: idSchema.optional(),
  created_by: idSchema.optional(),
  q: z.string().trim().max(60).optional(),
};

export const listTransactionsQuery = pagingSchema.extend(filters)
  .refine(dateRangeRefine, { message: 'تاريخ النهاية قبل البداية', path: ['to'] });

export const exportTransactionsQuery = z.object(filters)
  .refine(dateRangeRefine, { message: 'تاريخ النهاية قبل البداية', path: ['to'] });
