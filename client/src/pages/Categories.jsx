/**
 * التصنيفات: شجرة لكل نوع (مصروف/دخل). الحذف يؤرشف لو التصنيف مستخدم،
 * والمؤرشف يظهر عند الطلب ويرجع بضغطة.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { categoryTree, useCategories } from '../lib/queries.js';
import CategoryForm from '../components/categories/CategoryForm.jsx';
import {
  Badge, Button, Card, CategoryIcon, EmptyState, ErrorState, ListSkeleton, Menu, MenuItem, PageHead, Switch, Tabs, useConfirm,
} from '../components/ui/index.js';

function CategoryRow({ category, icon, onEdit, onAddChild, onRemove, onRestore }) {
  const archived = Boolean(category.archived_at);
  return (
    <div className={`list-item cat-row ${archived ? 'archived' : ''}`}>
      <CategoryIcon icon={icon} color={category.color} size={category.parent_id ? 'sm' : ''} />
      <span className="grow truncate title">{category.name}</span>
      {archived && <Badge tone="warning">مؤرشف</Badge>}
      <Menu label={`خيارات ${category.name}`}>
        {archived ? (
          <MenuItem icon="restore" onClick={() => onRestore(category)}>إرجاع</MenuItem>
        ) : (
          <>
            <MenuItem icon="edit" onClick={() => onEdit(category)}>تعديل</MenuItem>
            {onAddChild && <MenuItem icon="plus" onClick={() => onAddChild(category)}>تصنيف فرعي</MenuItem>}
            <MenuItem icon="archive" danger onClick={() => onRemove(category)}>حذف</MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}

export default function Categories() {
  useDocumentTitle('التصنيفات');
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(null);
  const categories = useCategories({ includeArchived: showArchived });

  const tree = useMemo(() => categoryTree(categories.data, kind), [categories.data, kind]);
  const activeParents = tree.filter((parent) => !parent.archived_at);
  const counts = useMemo(() => ({
    expense: (categories.data ?? []).filter((category) => category.kind === 'expense' && !category.archived_at).length,
    income: (categories.data ?? []).filter((category) => category.kind === 'income' && !category.archived_at).length,
  }), [categories.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  async function remove(category) {
    const ok = await confirm({
      title: `حذف «${category.name}»؟`,
      message: 'لو التصنيف مستخدم في عمليات هيتأرشف مع فروعه بدل الحذف: يختفي من الاختيارات وتفضل العمليات القديمة باسمه. وأي ميزانية عليه هتتشال.',
      danger: true,
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    try {
      const result = await api.del(`/categories/${category.id}`);
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success(result?.archived ? 'اتأرشف التصنيف' : 'اتحذف التصنيف');
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function restore(category) {
    try {
      await api.patch(`/categories/${category.id}`, { archived: false });
      await refresh();
      toast.success('رجع التصنيف');
    } catch (error) {
      toast.error(error.message);
    }
  }

  const handlers = { onEdit: (category) => setForm({ category }), onRemove: remove, onRestore: restore };

  return (
    <div className="page">
      <PageHead
        title="التصنيفات"
        description="رتّب مصاريفك ودخلك على كيفك — التصنيف الرئيسي بيجمع فروعه في التقارير والميزانيات"
        actions={<Button variant="primary" icon="plus" onClick={() => setForm({})}>تصنيف جديد</Button>}
      />
      <Tabs value={kind} onChange={setKind} items={[{ id: 'expense', label: 'المصروف', count: counts.expense }, { id: 'income', label: 'الدخل', count: counts.income }]} />

      <Card flush>
        {categories.isLoading && <ListSkeleton rows={6} />}
        {categories.isError && <ErrorState error={categories.error} onRetry={categories.refetch} />}
        {categories.isSuccess && tree.length === 0 && <EmptyState emoji="🏷️" title="مفيش تصنيفات" action={<Button variant="primary" icon="plus" onClick={() => setForm({})}>ضيف تصنيف</Button>} />}
        <div className="list">
          {tree.map((parent) => (
            <div key={parent.id}>
              <CategoryRow category={parent} icon={parent.icon} {...handlers} onAddChild={(category) => setForm({ parentId: category.id })} />
              {parent.children.length > 0 && (
                <div className="cat-children">
                  {parent.children.map((child) => <CategoryRow key={child.id} category={child} icon={parent.icon} {...handlers} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Switch checked={showArchived} onChange={setShowArchived} label="إظهار المؤرشف" />

      <CategoryForm
        open={Boolean(form)}
        kind={form?.category?.kind ?? kind}
        category={form?.category}
        parentId={form?.parentId}
        parents={activeParents}
        onClose={() => setForm(null)}
      />
    </div>
  );
}
