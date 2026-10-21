/**
 * نصوص الفواتير والأقساط: «كل شهر يوم 31»، «بعد يومين»، «قسط 3 من 10»…
 * وتقسيم التقسيط بنفس قاعدة السيرفر (installments.service.js → buildSchedule)
 * لمعاينة القسط في النموذج قبل الحفظ.
 */
import { formatDayMonth, formatWeekday } from './format.js';
import { addMonths, diffDays } from './period.js';

export const FREQUENCIES = [
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
  { value: 'yearly', label: 'سنوي' },
];

/** العدد بالعامية: 1 «يوم» · 2 «يومين» · 3–10 «5 أيام» · 11+ «12 يوم» */
export function countText(count, { one, two, few, many }) {
  if (count === 1) return one;
  if (count === 2) return two;
  if (count >= 3 && count <= 10) return `${count} ${few}`;
  return `${count} ${many}`;
}

export const daysText = (count) => countText(count, { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوم' });

const EVERY = {
  weekly: { one: 'أسبوع', two: 'أسبوعين', few: 'أسابيع', many: 'أسبوع' },
  monthly: { one: 'شهر', two: 'شهرين', few: 'شهور', many: 'شهر' },
  yearly: { one: 'سنة', two: 'سنتين', few: 'سنين', many: 'سنة' },
};

/** «كل شهر يوم 31» · «كل أسبوعين يوم الخميس» · «كل سنة يوم 29 فبراير» */
export function describeSchedule({ frequency, interval_count: interval = 1, start_on: startOn }) {
  const every = `كل ${countText(interval, EVERY[frequency])}`;
  if (!startOn) return every;
  if (frequency === 'weekly') return `${every} يوم ${formatWeekday(startOn)}`;
  if (frequency === 'yearly') return `${every} يوم ${formatDayMonth(startOn)}`;
  return `${every} يوم ${Number(startOn.slice(8, 10))}`;
}

/** المعاد بالنسبة للنهارده: «النهارده» · «بكره» · «بعد 5 أيام» · «امبارح» · «من يومين» */
export function dueLabel(dueOn, today) {
  const diff = diffDays(today, dueOn);
  if (diff === 0) return 'النهارده';
  if (diff === 1) return 'بكره';
  if (diff === -1) return 'امبارح';
  return diff > 0 ? `بعد ${daysText(diff)}` : `من ${daysText(-diff)}`;
}

/**
 * نفس اليوم بعد n شهر، مقصوص على آخر الشهر (31 يناير + 1 ← 28/29 فبراير)
 * — نفس قاعدة مواعيد السيرفر (schedule.js).
 */
export function addMonthsClamped(iso, count) {
  const month = addMonths(iso.slice(0, 7), count);
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(iso.slice(8, 10)), lastDay)).padStart(2, '0')}`;
}

export const installmentsText = (count) => countText(count, { one: 'قسط', two: 'قسطين', few: 'أقساط', many: 'قسط' });

/** { seq, count } ← «المقدّم» أو «قسط 3 من 10» */
export const installmentLabel = ({ seq, count }) => (seq === 0 ? 'المقدّم' : `قسط ${seq} من ${count}`);

/** فعل الزرار حسب النوع: دفعت (مصروف) · اتقبض (دخل) · اتحوّل (تحويل) */
export const postVerb = (type) => ({ income: 'اتقبض', transfer: 'اتحوّل' }[type] ?? 'دفعت');

/**
 * قسمة التقسيط بالقروش: الأقساط متساوية والأخير ياخد الباقي.
 * يعيد { base, last } أو null لو المدخلات لا تكوّن جدولًا صالحًا.
 */
export function splitInstallments(total, down = 0, count) {
  if (!total || !count || count < 1 || (down ?? 0) >= total) return null;
  const rest = total - (down ?? 0);
  if (rest < count) return null;
  const base = Math.floor(rest / count);
  return { base, last: rest - base * (count - 1) };
}
