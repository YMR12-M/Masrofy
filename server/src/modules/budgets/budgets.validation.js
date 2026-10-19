import { z } from 'zod';
import { idSchema, monthKey, positiveMinor } from '../../utils/schemas.js';

/** التنبيه بين 10% و100% من الحدّ (بالـ basis points) */
const alertBps = z.number().int().min(1000).max(10_000);

export const createBudgetSchema = z.object({
  category_id: idSchema,
  amount_minor: positiveMinor,
  alert_bps: alertBps.optional(),
});

export const updateBudgetSchema = z.object({
  amount_minor: positiveMinor.optional(),
  alert_bps: alertBps.optional(),
}).strict();

export const listBudgetsQuery = z.object({ month: monthKey.optional() });
