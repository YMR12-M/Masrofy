/**
 * الشهر المالي — نفس قواعد السيرفر (server/src/utils/dates.js) بالحرف.
 *
 * الأسرة تحدّد يوم بداية شهرها (يوم القبض، 1 – 28). الفترة تُسمّى بالشهر
 * الذي تبدأ فيه: بداية 25 ← «2026-10» = 25 أكتوبر حتى 24 نوفمبر.
 */
const MS_DAY = 86_400_000;
const parse = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);

export const addDays = (iso, days) => toIso(new Date(parse(iso).getTime() + days * MS_DAY));
export const diffDays = (a, b) => Math.round((parse(b).getTime() - parse(a).getTime()) / MS_DAY);

/** «اليوم» بتوقيت الأسرة */
export function todayIn(timeZone = 'Africa/Cairo', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addMonths(monthKey, count) {
  const [year, month] = monthKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const dayOf = (monthKey, day) => `${monthKey}-${String(day).padStart(2, '0')}`;

/** حدود الفترة شاملةً الطرفين */
export function periodRange(monthKey, startDay = 1) {
  return {
    month: monthKey,
    from: dayOf(monthKey, startDay),
    to: addDays(dayOf(addMonths(monthKey, 1), startDay), -1),
  };
}

export function periodOf(dateIso, startDay = 1) {
  const monthKey = dateIso.slice(0, 7);
  return Number(dateIso.slice(8, 10)) >= startDay ? monthKey : addMonths(monthKey, -1);
}

/** الفترة الحالية لأسرة المستخدم */
export const currentMonth = (household) =>
  periodOf(todayIn(household?.timezone), household?.month_start_day ?? 1);
