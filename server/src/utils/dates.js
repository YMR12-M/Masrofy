/**
 * ═══════════════════════════════════════════════════════════════
 *  التواريخ بلا منطقة زمنية + «الشهر المالي»
 *
 *  تاريخ العملية تقويمي (`2026-07-14`) لا لحظة زمنية. لو تعاملنا معه
 *  كـ Date محلي لاختلف الناتج حسب منطقة جهاز المستخدم أو السيرفر.
 *  الحل: نخزّنه ونمرّره نصًّا ISO ونحسب عليه بحساب UTC فقط.
 *  «اليوم» الوحيد الذي يعتمد على منطقة زمنية هو `todayIn(tz)`، وتُمرَّر
 *  إليه منطقة الأسرة صراحةً.
 *
 *  الشهر المالي: كثير من البيوت تحسب شهرها من يوم القبض لا من أول الشهر.
 *  الأسرة تحدّد `month_start_day` (1 – 28). الفترة تُسمّى بالشهر الذي
 *  **تبدأ** فيه: لو يوم البداية 25 فـ «2026-10» = من 25 أكتوبر إلى 24 نوفمبر.
 *  ويوم البداية 1 يعني الشهر التقويمي العادي.
 * ═══════════════════════════════════════════════════════════════
 */
const MS_DAY = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const parseIso = (iso) => new Date(`${iso}T00:00:00Z`);
export const toIso = (date) => date.toISOString().slice(0, 10);

/** تاريخ صالح فعلًا (يرفض 2026-02-31) */
export function isValidIso(value) {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const date = parseIso(value);
  return !Number.isNaN(date.getTime()) && toIso(date) === value;
}

export const isValidMonth = (value) => typeof value === 'string' && MONTH_RE.test(value);

export const addDays = (iso, days) => toIso(new Date(parseIso(iso).getTime() + days * MS_DAY));

/** عدد الأيام من a إلى b (موجب لو b بعد a) */
export const diffDays = (a, b) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / MS_DAY);

/** كل الأيام في المدى [from, to] شاملةً الطرفين */
export function eachDay(from, to) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** "اليوم" كما هو في منطقة زمنية محدّدة (صيغة YYYY-MM-DD) */
export function todayIn(timeZone = 'Africa/Cairo', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/* ── الأشهر ──────────────────────────────────────────────────── */

/** '2026-10' + n شهر ← '2026-12' */
export function addMonths(monthKey, count) {
  const [year, month] = monthKey.split('-').map(Number);
  const index = year * 12 + (month - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const dayOf = (monthKey, day) => `${monthKey}-${String(day).padStart(2, '0')}`;

/** حدود الشهر المالي شاملةً الطرفين: { from, to } */
export function periodRange(monthKey, startDay = 1) {
  const from = dayOf(monthKey, startDay);
  const to = addDays(dayOf(addMonths(monthKey, 1), startDay), -1);
  return { month: monthKey, from, to };
}

/** الشهر المالي الذي يقع فيه تاريخ */
export function periodOf(dateIso, startDay = 1) {
  const monthKey = dateIso.slice(0, 7);
  return Number(dateIso.slice(8, 10)) >= startDay ? monthKey : addMonths(monthKey, -1);
}
