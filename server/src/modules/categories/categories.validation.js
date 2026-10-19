import { z } from 'zod';
import { boolish, colorSchema, idSchema } from '../../utils/schemas.js';

/** إيموجي واحد أو اتنين — يكفي للأيقونة ولا يفتح باب نصوص طويلة */
const icon = z.string().trim().max(16).transform((value) => (value === '' ? null : value)).nullable();

const base = z.object({
  name: z.string().trim().min(1).max(60),
  icon,
  color: colorSchema,
  sort_order: z.number().int().min(-1000).max(100_000),
  parent_id: idSchema.nullable(),
});

export const createCategorySchema = base.partial()
  .extend({ kind: z.enum(['expense', 'income']) })
  .required({ name: true });

export const updateCategorySchema = base.partial()
  .extend({ archived: z.boolean().optional() })
  .strict();

export const listCategoriesQuery = z.object({
  kind: z.enum(['expense', 'income']).optional(),
  include_archived: boolish.optional(),
});
