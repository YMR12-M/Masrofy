/**
 * ═══════════════════════════════════════════════════════════════
 *  أدوار أفراد الأسرة وصلاحياتهم
 *
 *  الصلاحية نصّ بصيغة `مورد.إجراء`. الدور مجموعة صلاحيات ثابتة في الكود
 *  (لا جدول للأدوار): أبسط في المراجعة، ولا يمكن لخلل في البيانات أن
 *  يمنح أحدًا ما لم نقصده.
 *
 *  الحسابات نوعان:
 *   • مشتركة (owner_user_id = NULL): تظهر لمن يملك `accounts.read`.
 *   • خاصّة بفرد: تظهر لصاحبها فقط — ولا حتى لصاحب الأسرة.
 *  فكل فرد يملك «جيبه» الخاص (`accounts.own`) حتى لو لا يرى المشترك،
 *  مثل الأبناء: يسجّلون مصروفهم في حسابهم ولا يطّلعون على حسابات البيت.
 * ═══════════════════════════════════════════════════════════════
 */

export const ROLES = ['owner', 'admin', 'member', 'child', 'viewer'];

export const ROLE_LABELS = {
  owner: 'صاحب الأسرة',
  admin: 'مشرف',
  member: 'فرد',
  child: 'ابن / ابنة',
  viewer: 'مشاهدة فقط',
};

export const PERMISSIONS = [
  'household.manage',     // إعدادات الأسرة وإدارة الأفراد
  'accounts.read',        // رؤية الحسابات المشتركة وعملياتها
  'accounts.manage',      // إنشاء وتعديل الحسابات المشتركة
  'accounts.own',         // حسابات خاصّة بالفرد نفسه
  'transactions.write',   // تسجيل عمليات على الحسابات المشتركة
  'categories.manage',
  'budgets.read', 'budgets.manage',
  'reports.read',         // التقارير — محسوبة دائمًا على ما يراه الفرد فقط
  'audit.read',
];

const ALL = new Set(PERMISSIONS);

export const ROLE_PERMISSIONS = {
  owner: ALL,
  admin: ALL,

  member: new Set([
    'accounts.read', 'accounts.own', 'transactions.write',
    'budgets.read', 'reports.read',
  ]),

  // الأبناء: جيبهم الخاص وتقاريره فقط
  child: new Set(['accounts.own', 'reports.read']),

  viewer: new Set(['accounts.read', 'budgets.read', 'reports.read']),
};

export const can = (role, permission) => ROLE_PERMISSIONS[role]?.has(permission) ?? false;

/** الصلاحيات التي تُرسَل للواجهة لتُخفي ما لا يحقّ للمستخدم رؤيته */
export const permissionsOf = (role) => [...(ROLE_PERMISSIONS[role] ?? [])];
