/** ثوابت العرض: تسميات عربية لقيم السيرفر، وألوان وأيقونات للاختيار */

export const ROLE_LABELS = {
  owner: 'صاحب الأسرة',
  admin: 'مشرف',
  member: 'فرد',
  child: 'ابن / ابنة',
  viewer: 'مشاهدة فقط',
};

export const ROLE_HINTS = {
  owner: 'كل الصلاحيات، ومنها إضافة أصحاب آخرين',
  admin: 'كل شيء ما عدا تعديل حساب صاحب الأسرة',
  member: 'يشوف الحسابات المشتركة ويسجّل عليها، وله حساباته الخاصّة',
  child: 'حساباته الخاصّة بس (مصروفه)، ومش بيشوف حسابات البيت',
  viewer: 'يشوف الحسابات والتقارير من غير تعديل',
};

export const ACCOUNT_TYPES = [
  { value: 'cash', label: 'كاش', icon: 'cash' },
  { value: 'bank', label: 'حساب بنكي', icon: 'bank' },
  { value: 'wallet', label: 'محفظة إلكترونية', icon: 'phone' },
  { value: 'card', label: 'بطاقة ائتمان', icon: 'card' },
  { value: 'savings', label: 'ادخار', icon: 'safe' },
  { value: 'other', label: 'أخرى', icon: 'box' },
];
export const ACCOUNT_TYPE = Object.fromEntries(ACCOUNT_TYPES.map((type) => [type.value, type]));

export const TX_TYPES = [
  { value: 'expense', label: 'مصروف', icon: 'arrow-up' },
  { value: 'income', label: 'دخل', icon: 'arrow-down' },
  { value: 'transfer', label: 'تحويل', icon: 'transfer' },
];
export const TX_TYPE_LABELS = Object.fromEntries(TX_TYPES.map((type) => [type.value, type.label]));

/** ألوان متاحة للحسابات والتصنيفات — مختارة لتقرأ في الوضعين الفاتح والداكن */
export const COLORS = [
  '#0d6b57', '#047857', '#15803d', '#4d7c0f', '#0e7490', '#0369a1', '#1d4ed8', '#4338ca',
  '#7c3aed', '#a21caf', '#db2777', '#be123c', '#c2410c', '#b45309', '#475569', '#57534e',
];

export const EMOJIS = [
  '🛒', '🍽️', '🥖', '☕', '🏠', '💡', '💧', '🔥', '📱', '🌐', '🚗', '⛽', '🚕', '🚌',
  '💊', '🩺', '📚', '🎓', '👕', '👟', '🎉', '🎬', '✈️', '🎁', '🤲', '🕌', '🧒', '🍼',
  '🐾', '💳', '🏦', '🧾', '🔧', '🧹', '💄', '🏋️', '📦', '💼', '💻', '🏢', '📈', '💰',
];

/** حدود التنبيه المقترحة للميزانية (basis points) */
export const ALERT_LEVELS = [
  { value: 7000, label: '70%' },
  { value: 8000, label: '80%' },
  { value: 9000, label: '90%' },
  { value: 10000, label: '100%' },
];

export const BUDGET_STATUS = {
  ok: { label: 'في الأمان', tone: 'income' },
  warning: { label: 'قرّبت من الحدّ', tone: 'warning' },
  over: { label: 'عدّت الحدّ', tone: 'danger' },
};
