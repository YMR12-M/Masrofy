/**
 * ═══════════════════════════════════════════════════════════════
 *  الفلوس
 *
 *  القاعدة: كل مبلغ في القاعدة والـ API **عدد صحيح بأصغر وحدة**
 *  (قروش: 1 جنيه = 100). لا floats ولا DECIMAL — فلا يظهر أبدًا
 *  فرق 0.01 جنيه بين رصيد حساب وإجمالي تقرير.
 *
 *  النِّسَب تُخزَّن بالـ basis points: 8000 = 80.00%.
 * ═══════════════════════════════════════════════════════════════
 */

/** تقريب النصف بعيدًا عن الصفر (متماثل للموجب والسالب) */
export const roundHalfUp = (value) => (value < 0 ? -Math.round(-value) : Math.round(value));

export const sum = (values) => values.reduce((total, value) => total + value, 0);

/** النسبة بالـ basis points: part من whole (0 لو whole صفر) */
export const ratioBps = (part, whole) => (whole > 0 ? roundHalfUp((part * 10_000) / whole) : 0);

/** جنيه (رقم أو نصّ) → قروش */
export const toMinor = (major) => roundHalfUp(Number(major) * 100);

/** تنسيق للعرض في الرسائل والبريد — الواجهات تنسّق بنفسها */
export function formatMinor(minor, currency = 'EGP', locale = 'ar-EG') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}
