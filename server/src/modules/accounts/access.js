/**
 * ═══════════════════════════════════════════════════════════════
 *  مَن يرى أيّ حساب، ومَن يسجّل عليه
 *
 *  القاعدة الوحيدة لكل الفلوس في التطبيق — الحسابات والعمليات والميزانيات
 *  والتقارير كلها تمرّ من هنا، فلا يظهر جنيه من حساب خاص لغير صاحبه في
 *  أي شاشة أو تقرير:
 *
 *   • الحساب المشترك (owner_user_id = NULL): يراه من يملك `accounts.read`،
 *     ويسجّل عليه من يملك `transactions.write`، ويعدّله من يملك `accounts.manage`.
 *   • الحساب الخاص: صاحبه فقط يراه ويسجّل عليه ويعدّله.
 * ═══════════════════════════════════════════════════════════════
 */
import { can } from '../../config/permissions.js';

export const seesShared = (user) => can(user.role, 'accounts.read');

const isShared = (account) => account.owner_user_id === null || account.owner_user_id === undefined;

/**
 * شرط SQL للحسابات الظاهرة للمستخدم.
 * @returns {{ sql: string, params: any[] }}  يُدمج كما هو: `WHERE ${v.sql}` و`params.push(...v.params)`
 *
 * «مشترك أو بتاعي» مكتوبة `IFNULL(owner, 0) IN (0, ?)` لا `owner IS NULL OR owner = ?`:
 * الصيغة الثانية على جدول LEFT JOIN (وجهة التحويل `ta`) مع معامل prepared
 * statement ترجّع صفوفًا غلط في MySQL 9.7 — كانت تكشف تحويلًا بين جيبين
 * خاصّين لصاحب الأسرة. المعنى واحد (معرّفات الأفراد تبدأ من 1).
 */
export function visibleAccounts(user, alias = 'a') {
  return seesShared(user)
    ? { sql: `IFNULL(${alias}.owner_user_id, 0) IN (0, ?)`, params: [user.id] }
    : { sql: `${alias}.owner_user_id = ?`, params: [user.id] };
}

export const canSeeAccount = (user, account) =>
  (isShared(account) ? seesShared(user) : account.owner_user_id === user.id);

/** تعديل بيانات الحساب نفسه (الاسم، الرصيد الافتتاحي، الأرشفة) */
export const canManageAccount = (user, account) =>
  (isShared(account) ? can(user.role, 'accounts.manage') : account.owner_user_id === user.id && can(user.role, 'accounts.own'));

/** تسجيل عمليات على الحساب */
export const canRecordOn = (user, account) =>
  (isShared(account) ? can(user.role, 'transactions.write') : account.owner_user_id === user.id);
