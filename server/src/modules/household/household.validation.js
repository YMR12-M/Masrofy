import { z } from 'zod';

/** العملات المدعومة حاليًا: عملة واحدة لكل أسرة (لا تحويل أسعار بعد) */
export const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'GBP'];

const isTimeZone = (value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

export const updateHouseholdSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  currency: z.enum(CURRENCIES).optional(),
  timezone: z.string().trim().max(60).refine(isTimeZone, 'منطقة زمنية غير معروفة').optional(),
  month_start_day: z.number().int().min(1).max(28).optional(),
}).strict();
