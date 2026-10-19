/**
 * تنسيق الأرقام والفلوس والتواريخ.
 *
 * الأرقام لاتينية (0-9) حتى في العربية: هكذا تُكتب على الإيصالات وتطبيقات
 * البنوك، ولا تلتبس بين أنظمة الأرقام. المبالغ كلها تصل بالقروش.
 * التواريخ نصوص ISO (YYYY-MM-DD) تُعرَض بلا تحويل منطقة زمنية.
 */
const LOCALE = 'ar-EG-u-nu-latn';

const numberFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const moneyFormats = new Map();

export const formatNumber = (value) => (value === null || value === undefined ? '—' : numberFormat.format(value));

function moneyFormat(currency, compact) {
  const key = `${currency}:${compact}`;
  if (!moneyFormats.has(key)) {
    moneyFormats.set(key, new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 0 : 2,
    }));
  }
  return moneyFormats.get(key);
}

/**
 * قروش ← «1,250.00 ج.م.»
 * compact: بلا قروش لو المبلغ صحيح (للبطاقات الكبيرة).
 * Intl يضع LRM قبل إشارة السالب فيقلب مكان العملة داخل `.num`؛ نحذفه.
 */
export function formatMoney(minor, currency = 'EGP', { compact = false } = {}) {
  if (minor === null || minor === undefined) return '—';
  const whole = compact && minor % 100 === 0;
  return moneyFormat(currency, whole).format(minor / 100).replace(/‎/g, '');
}

/** رمز العملة بالعربي لحقول الإدخال: EGP ← «ج.م.» */
export function currencySymbol(currency = 'EGP') {
  return moneyFormat(currency, true).formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;
}

/**
 * المصروف بالسالب والدخل بـ + في القوائم.
 * الإشارة توضع داخل نصّ Intl (بعد علامة RLM التي يبدأ بها) لا قبله، وإلا خرجت
 * من الاتجاه العربي وظهرت في الطرف الآخر من المبلغ.
 */
export function formatSigned(minor, type, currency = 'EGP') {
  if (type === 'expense') return formatMoney(-minor, currency);
  const text = formatMoney(minor, currency);
  return type === 'income' ? text.replace(/^(‏?)/, '$1+') : text;
}

/** قروش ← نص لحقل الإدخال (جنيه) */
export const minorToInput = (minor) => (minor === null || minor === undefined ? '' : (minor / 100).toFixed(2).replace(/\.00$/, ''));

/**
 * ما كتبه المستخدم (جنيه) ← قروش صحيحة، أو null لو غير صالح.
 * يقبل الأرقام العربية الهندية (٠-٩) والفاصلة العشرية العربية «٫» وفواصل الآلاف.
 */
export function inputToMinor(text, { allowNegative = false } = {}) {
  if (text === '' || text === null || text === undefined) return null;
  const normalized = String(text)
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[٫,]/g, (mark) => (mark === '٫' ? '.' : ''))
    .replace(/[−–]/g, '-')
    .trim();
  if (!/^-?\d*(\.\d{0,2})?$/.test(normalized) || normalized === '' || normalized === '-' || normalized === '.') return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || (!allowNegative && number < 0)) return null;
  return Math.round(number * 100);
}

/** نسبة من basis points: 8333 ← «83%» */
export const formatBps = (bps, digits = 0) => (bps === null || bps === undefined ? '—' : `${(bps / 100).toFixed(digits)}%`);

/* ── التواريخ ─────────────────────────────────────────────── */
const parse = (iso) => new Date(`${iso}T00:00:00Z`);

const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonthFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: 'UTC' });
const monthYearFormat = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShortFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const formatDate = (iso) => (iso ? dateFormat.format(parse(iso)) : '—');
export const formatDayMonth = (iso) => (iso ? dayMonthFormat.format(parse(iso)) : '—');
export const formatWeekday = (iso) => weekdayFormat.format(parse(iso));
/** '2026-10' ← «أكتوبر 2026» */
export const formatMonth = (monthKey) => monthYearFormat.format(parse(`${monthKey}-01`));
export const formatMonthShort = (monthKey) => monthShortFormat.format(parse(`${monthKey}-01`));
/** لحظة (timestamp) ← «4 أكتوبر 3:25 م» بتوقيت الجهاز */
export const formatDateTime = (value) => (value ? dateTimeFormat.format(new Date(value)) : '—');

/** «النهارده» · «امبارح» · «الأربعاء 15 أكتوبر» لعناوين أيام القائمة */
export function formatDayHeading(iso, today) {
  if (iso === today) return 'النهارده';
  const diff = Math.round((parse(today) - parse(iso)) / 86_400_000);
  if (diff === 1) return 'امبارح';
  return `${formatWeekday(iso)} ${formatDate(iso)}`;
}

export const initials = (name = '') => name.trim()[0] ?? '؟';

/** الاسم الأول للتحية */
export const firstName = (name = '') => name.trim().split(/\s+/)[0] ?? '';
