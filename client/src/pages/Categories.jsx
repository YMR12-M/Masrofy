/**
 * التصنيفات: بطاقة لكل تصنيف رئيسي وفروعه، لكل نوع (مصروف/دخل). الحذف يؤرشف
 * لو التصنيف مستخدم، والمؤرشف يظهر عند الطلب ويرجع بضغطة.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { countText } from '../lib/bills.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { categoryTree, useCategories } from '../lib/queries.js';
import CategoryForm from '../components/categories/CategoryForm.jsx';
import {
  Badge, Button, Card, CategoryIcon, EmptyState, ErrorState, Menu, MenuItem, PageHead, Skeleton, Switch, Tabs, useConfirm,
} from '../components/ui/index.js';

function CategoryMenu({ category, onEdit, onAddChild, onRemove, onRestore }) {
  const archived = Boolean(category.archived_at);
  return (
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
  );
}

function CategoryGroup({ parent, handlers, onAddChild }) {
  const archived = Boolean(parent.archived_at);
  const active = parent.children.filter((child) => !child.archived_at).length;
  return (
    <section className={`card cat-group ${archived ? 'archived' : ''}`} aria-label={parent.name}>
      <div className="card-head">
        <span className="row" style={{ minWidth: 0 }}>
          <CategoryIcon icon={parent.icon} color={parent.color} />
          <span style={{ minWidth: 0 }}>
            <span className="title truncate" style={{ display: 'block' }}>{parent.name}</span>
            <span className="meta">
              {archived ? <Badge tone="warning">مؤرشف</Badge> : active ? countText(active, { one: 'فرع واحد', two: 'فرعين', few: 'فروع', many: 'فرع' }) : 'من غير فروع'}
            </span>
          </span>
        </span>
        <CategoryMenu category={parent} {...handlers} onAddChild={onAddChild} />
      </div>
      {parent.children.length > 0 && (
        <div className="list cat-children">
          {parent.children.map((child) => (
            <div key={child.id} className={`list-item cat-row ${child.archived_at ? 'archived' : ''}`}>
              <CategoryIcon icon={parent.icon} color={child.color} size="sm" />
              <span className="grow truncate">{child.name}</span>
              {child.archived_at && <Badge tone="warning">مؤرشف</Badge>}
              <CategoryMenu category={child} {...handlers} />
            </div>
          ))}
        </div>
      )}
      {!archived && (
        <div className="card-foot">
          <Button variant="ghost" size="sm" icon="plus" onClick={() => onAddChild(parent)}>فرع جديد</Button>
        </div>
      )}
    </section>
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
  const addChild = (category) => setForm({ parentId: category.id });

  return (
    <div className="page">
      <PageHead
        title="التصنيفات"
        description="رتّب مصاريفك ودخلك على كيفك. التصنيف الرئيسي بيجمع فروعه في التقارير والميزانيات."
        actions={<Button variant="primary" icon="plus" onClick={() => setForm({})}>تصنيف جديد</Button>}
      />

      <div className="stack sm">
        <Tabs value={kind} onChange={setKind} items={[{ id: 'expense', label: 'المصروف', count: counts.expense }, { id: 'income', label: 'الدخل', count: counts.income }]} />
        <div className="row between wrap">
          <span className="xsmall faint">التصنيفات المستخدمة في عمليات بتتأرشف بدل ما تتحذف.</span>
          <Switch checked={showArchived} onChange={setShowArchived} label="إظهار المؤرشف" />
        </div>
      </div>

      {categories.isLoading && (
        <div className="cat-groups" aria-hidden="true">
          {[150, 220, 120, 190, 160, 140].map((height, index) => <Skeleton key={index} height={height} style={{ borderRadius: 14, marginBottom: 16, breakInside: 'avoid' }} />)}
        </div>
      )}
      {categories.isError && <Card><ErrorState error={categories.error} onRetry={categories.refetch} /></Card>}
      {categories.isSuccess && tree.length === 0 && (
        <Card>
          <EmptyState
            icon="tag"
            title={`مفيش تصنيفات ${kind === 'income' ? 'دخل' : 'مصروف'}`}
            description={kind === 'income' ? 'زي المرتب، الإيجار اللي بتقبضه، أو أي فلوس داخلة البيت.' : 'زي الأكل، المواصلات، الفواتير. ضيف اللي يناسب بيتك.'}
            action={<Button variant="primary" icon="plus" onClick={() => setForm({})}>ضيف تصنيف {kind === 'income' ? 'دخل' : 'مصروف'}</Button>}
          />
        </Card>
      )}

      {tree.length > 0 && (
        <div className="cat-groups">
          {tree.map((parent) => <CategoryGroup key={parent.id} parent={parent} handlers={handlers} onAddChild={addChild} />)}
        </div>
      )}

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
