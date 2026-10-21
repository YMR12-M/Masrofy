/**
 * ═══════════════════════════════════════════════════════════════
 *  مواعيد التكرار — دوال صافية بلا قاعدة بيانات
 *
 *  المعاد رقم n يُحسب دائمًا من أول معاد (start_on)، لا من المعاد السابق:
 *  لو حسبنا «الشهر اللي بعده» من 28 فبراير لصار كل شهر بعده يوم 28.
 *  فالشهري يوم 31 = 31 يناير، 28 (أو 29) فبراير، 31 مارس، 30 أبريل…
 *  والسنوي يوم 29 فبراير يقع 28 فبراير في السنين البسيطة و29 في الكبيسة.
 *
 *  القاعدة هنا أيّ كائن فيه:
 *    { frequency: weekly|monthly|yearly, interval_count, start_on, end_on?, total_count? }
 * ═══════════════════════════════════════════════════════════════
 */
import { addDays, addMonths, diffDays } from '../../utils/dates.js';

/** حدّ أمان لأي حلقة على المواعيد (أسبوعي لعشر سنين ≈ 520) */
export const MAX_SCAN = 2000;

const monthOf = (iso) => iso.slice(0, 7);
const dayNumber = (iso) => Number(iso.slice(8, 10));

/** عدد أيام الشهر: '2028-02' ← 29 */
export function daysInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** عدد الشهور من شهر a إلى شهر b ('2026-11' → '2027-02' = 3) */
export function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

/** يوم بعينه في شهر، مقصوص على آخر الشهر (31 في أبريل ← 30) */
const clampedDay = (monthKey, day) => `${monthKey}-${String(Math.min(day, daysInMonth(monthKey))).padStart(2, '0')}`;

/** كم شهرًا بين معادين متتاليين (0 للأسبوعي) */
const monthStep = (rule) => {
  if (rule.frequency === 'weekly') return 0;
  return (rule.frequency === 'yearly' ? 12 : 1) * (rule.interval_count || 1);
};

/** المعاد رقم n (من صفر) */
export function occurrenceAt(rule, n) {
  if (rule.frequency === 'weekly') return addDays(rule.start_on, 7 * (rule.interval_count || 1) * n);
  return clampedDay(addMonths(monthOf(rule.start_on), monthStep(rule) * n), dayNumber(rule.start_on));
}

/** أصغر n معاده في date أو بعده */
export function indexOnOrAfter(rule, date) {
  if (date <= rule.start_on) return 0;
  if (rule.frequency === 'weekly') return Math.ceil(diffDays(rule.start_on, date) / (7 * (rule.interval_count || 1)));
  let n = Math.max(0, Math.floor(monthsBetween(monthOf(rule.start_on), monthOf(date)) / monthStep(rule)));
  while (occurrenceAt(rule, n) < date) n += 1;
  return n;
}

/** هل المعاد رقم n داخل نهاية القاعدة (عدد المرات و/أو آخر تاريخ)؟ */
export function withinEnd(rule, n, date = occurrenceAt(rule, n)) {
  if (rule.total_count !== null && rule.total_count !== undefined && n >= rule.total_count) return false;
  if (rule.end_on && date > rule.end_on) return false;
  return true;
}

/** رقم المعاد لو التاريخ من مواعيد القاعدة فعلًا، وإلا -1 */
export function occurrenceIndex(rule, date) {
  const n = indexOnOrAfter(rule, date);
  return occurrenceAt(rule, n) === date && withinEnd(rule, n, date) ? n : -1;
}

/**
 * المواعيد في مدى (شاملًا الطرفين) داخل نهاية القاعدة: [{ seq, due_on }]
 * `from` اختياري (من أول معاد لو غائب)، و`limit` يقطع القائمة.
 */
export function occurrencesBetween(rule, { from, to, limit = MAX_SCAN } = {}) {
  const result = [];
  for (let n = from ? indexOnOrAfter(rule, from) : 0, scanned = 0; scanned < MAX_SCAN && result.length < limit; n += 1, scanned += 1) {
    const date = occurrenceAt(rule, n);
    if ((to && date > to) || !withinEnd(rule, n, date)) break;
    result.push({ seq: n, due_on: date });
  }
  return result;
}

/**
 * أول معاد لم يُعمل (لم يُسجَّل ولم يُتخطَّ)، أو null لو القاعدة خلصت.
 * `handled`: مجموعة تواريخ المواعيد اللي اتعملت.
 */
export function nextPending(rule, handled = new Set()) {
  for (let n = 0; n < MAX_SCAN; n += 1) {
    const date = occurrenceAt(rule, n);
    if (!withinEnd(rule, n, date)) return null;
    if (!handled.has(date)) return { seq: n, due_on: date };
  }
  return null;
}

/** كم معاد فاضل لم يُعمل — null لو القاعدة مفتوحة بلا نهاية */
export function remainingCount(rule, handled = new Set()) {
  if (!rule.end_on && (rule.total_count === null || rule.total_count === undefined)) return null;
  return occurrencesBetween(rule).filter((item) => !handled.has(item.due_on)).length;
}
