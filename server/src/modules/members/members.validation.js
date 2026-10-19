import { z } from 'zod';
import { ROLES } from '../../config/permissions.js';
import { emailSchema, optionalPhone, passwordSchema } from '../../utils/schemas.js';

const fullName = z.string().trim().min(2).max(120);

export const createMemberSchema = z.object({
  full_name: fullName,
  email: emailSchema,
  phone: optionalPhone,
  role: z.enum(ROLES),
  // لو فاضية نولّد كلمة مؤقتة تُعرض مرّة واحدة
  password: passwordSchema.optional(),
});

export const updateMemberSchema = z.object({
  full_name: fullName.optional(),
  phone: optionalPhone,
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'suspended']).optional(),
}).strict();
