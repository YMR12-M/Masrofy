/**
 * التصنيفات المقترحة لأي أسرة جديدة (السوق المصري).
 *
 * ليست بيانات تجريبية: لا عمليات ولا أرقام، بل نقطة بداية للتصنيف يعدّلها
 * صاحب الأسرة أو يؤرشفها كما يشاء. بدونها تبدأ كل أسرة بشاشة فاضية ولا
 * تقدر تسجّل أول مصروف قبل ما تبني شجرة تصنيفات كاملة.
 */
export const DEFAULT_CATEGORIES = {
  expense: [
    { name: 'أكل وشرب', icon: '🛒', color: '#c2410c', children: ['سوبرماركت', 'خضار وفاكهة', 'مطاعم وكافيهات', 'دليفري'] },
    { name: 'البيت', icon: '🏠', color: '#0f766e', children: ['إيجار', 'كهرباء', 'مياه', 'غاز', 'صيانة وتصليحات', 'مساعدة في البيت'] },
    { name: 'اتصالات وإنترنت', icon: '📱', color: '#4338ca', children: ['رصيد وباقات', 'إنترنت البيت'] },
    { name: 'مواصلات', icon: '🚗', color: '#1d4ed8', children: ['بنزين', 'أوبر وتاكسي', 'مواصلات عامة', 'صيانة العربية'] },
    { name: 'صحة', icon: '💊', color: '#be123c', children: ['كشف ودكتور', 'أدوية', 'تحاليل وأشعة'] },
    { name: 'تعليم', icon: '📚', color: '#7c3aed', children: ['مصاريف مدارس', 'دروس خصوصية', 'كتب وأدوات'] },
    { name: 'لبس', icon: '👕', color: '#a21caf' },
    { name: 'ترفيه وخروجات', icon: '🎉', color: '#db2777' },
    { name: 'هدايا ومناسبات', icon: '🎁', color: '#b45309' },
    { name: 'صدقات وزكاة', icon: '🤲', color: '#15803d' },
    { name: 'مصروف الأولاد', icon: '🧒', color: '#0369a1' },
    { name: 'أقساط وديون', icon: '💳', color: '#475569' },
    { name: 'مصاريف أخرى', icon: '📦', color: '#57534e' },
  ],
  income: [
    { name: 'مرتب', icon: '💼', color: '#047857' },
    { name: 'شغل حر', icon: '💻', color: '#0e7490' },
    { name: 'إيجار عقار', icon: '🏢', color: '#4d7c0f' },
    { name: 'أرباح وفوايد', icon: '📈', color: '#15803d' },
    { name: 'هدايا وعيديات', icon: '🎁', color: '#b45309' },
    { name: 'دخل آخر', icon: '💰', color: '#57534e' },
  ],
};

/**
 * يُدرج التصنيفات الافتراضية لأسرة داخل معاملة.
 * الأبناء يرثون لون الأب ولا أيقونة لهم (تظهر أيقونة الأب في الواجهة).
 */
export async function seedDefaultCategories(tx, householdId) {
  for (const kind of ['expense', 'income']) {
    let order = 0;
    for (const category of DEFAULT_CATEGORIES[kind]) {
      order += 1;
      const parent = await tx.execute(
        `INSERT INTO categories (household_id, kind, name, icon, color, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [householdId, kind, category.name, category.icon, category.color, order * 10],
      );
      let childOrder = 0;
      for (const child of category.children ?? []) {
        childOrder += 1;
        await tx.execute(
          `INSERT INTO categories (household_id, parent_id, kind, name, icon, color, sort_order)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
          [householdId, parent.insertId, kind, child, category.color, childOrder * 10],
        );
      }
    }
  }
}
