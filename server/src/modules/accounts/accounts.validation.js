import { z } from 'zod';
import {
  boolish, colorSchema, minorAmount, optionalText, signedMinor,
} from '../../utils/schemas.js';

export const ACCOUNT_TYPES = ['cash', 'bank', 'wallet', 'card', 'savings', 'other'];

const base = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES),
  institution: optionalText(80),
  opening_balance_minor: signedMinor,
  credit_limit_minor: minorAmount.nullable(),
  color: colorSchema,
  include_in_net_worth: z.boolean(),
  sort_order: z.number().int().min(-1000).max(100_000),
});

export const createAccountSchema = base.partial()
  .extend({ scope: z.enum(['shared', 'private']).default('shared') })
  .required({ name: true, type: true });

export const updateAccountSchema = base.partial()
  .extend({ archived: z.boolean().optional() })
  .strict();

export const listAccountsQuery = z.object({
  include_archived: boolish.optional(),
});
