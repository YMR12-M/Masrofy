/**
 * الميزانيات: حدّ شهري لكل تصنيف وحالته في الشهر المختار.
 * العلامة على الشريط = حدّ التنبيه، وفي الملخّص = كم مضى من الشهر،
 * فيُقارَن الصرف بالوقت بنظرة («صرفت 70% ولسه في نص الشهر»).
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { formatBps, formatMoney } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { currentMonth } from '../lib/period.js';
import { BUDGET_STATUS } from '../lib/constants.js';
import BudgetForm from '../components/budgets/BudgetForm.jsx';
import {
  Badge, Button, Card, CategoryIcon, EmptyState, ErrorState, ListSkeleton, Menu, MenuItem, MonthNav, PageHead,
  Progress, useConfirm,
} from '../components/ui/index.js';

function Summary({ data, currency }) {
  const { totals, period } = data;
  const timeBps = Math.round((period.elapsed_days * 10_000) / period.days);
  const status = totals.used_bps > 10_000 ? 'over' : totals.used_bps > timeBps + 1000 ? 'warning' : 'ok';
  return (
    <Card>
      <div className="stack sm">
        <div className="row between wrap">
          <span className="muted">إجمالي الميزانيات</span>
          <span><span className="num bold">{formatMoney(totals.spent_minor, currency)}</span> <span className="muted">من</span> <span className="num">{formatMoney(totals.amount_minor, currency)}</span></span>
        </div>
        <Progress valueBps={totals.used_bps} status={status} markerBps={period.is_current ? timeBps : undefined} label="إجمالي الميزانيات" />
        <div className="row between wrap xsmall muted">
          <span>{totals.remaining_minor >= 0 ? 'فاضل' : 'زيادة'} <span className="num bold">{formatMoney(Math.abs(totals.remaining_minor), currency)}</span></span>
          {period.is_current && <span>مضى <span className="num">{formatBps(timeBps)}</span> من الشهر</span>}
        </div>
      </div>
    </Card>
  );
}

export default function Budgets() {
  useDocumentTitle('الميزانيات');
  const { user, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { currency, month_start_day: startDay } = user.household;
  const thisMonth = currentMonth(user.household);
  const [month, setMonth] = useState(thisMonth);
  const [form, setForm] = useState(null);
  const manage = can('budgets.manage');

  const budgets = useQuery({ queryKey: ['budgets', month], queryFn: () => api.get('/budgets', { month }) });
  const list = budgets.data?.budgets ?? [];

  async function remove(budget) {
    const ok = await confirm({ title: `حذف ميزانية «${budget.category_name}»؟`, message: 'العمليات نفسها مش هتتأثر.', danger: true, confirmLabel: 'حذف' });
    if (!ok) return;
    try {
      await api.del(`/budgets/${budget.id}`);
      await queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('اتحذفت الميزانية');
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <div className="page">
      <PageHead
        title="الميزانيات"
        description="سقف شهري لكل بند، وتنبيه قبل ما توصله"
        actions={manage && <Button variant="primary" icon="plus" onClick={() => setForm({})}>ميزانية جديدة</Button>}
      />
      <div><MonthNav month={month} onChange={setMonth} startDay={startDay} /></div>

      {budgets.isError && <ErrorState error={budgets.error} onRetry={budgets.refetch} />}
      {budgets.data && list.length > 0 && <Summary data={budgets.data} currency={currency} />}

      <Card flush>
        {budgets.isLoading && <ListSkeleton rows={4} />}
        {budgets.isSuccess && list.length === 0 && (
          <EmptyState
            emoji="🎯"
            title="مفيش ميزانيات"
            description="حدّد مثلًا 6000 جنيه للأكل في الشهر، وهتشوف هنا اتصرف قد إيه وفاضل قد إيه."
            action={manage && <Button variant="primary" icon="plus" onClick={() => setForm({})}>ضيف أول ميزانية</Button>}
          />
        )}
        {list.map((budget) => {
          const status = BUDGET_STATUS[budget.status];
          return (
            <div key={budget.id} className="budget-row">
              <div className="row between">
                <span className="row" style={{ minWidth: 0 }}>
                  <CategoryIcon icon={budget.category_icon ?? budget.parent_icon} color={budget.category_color} />
                  <span style={{ minWidth: 0 }}>
                    <span className="bold truncate" style={{ display: 'block' }}>{budget.category_name}</span>
                    {budget.parent_name && <span className="xsmall faint">{budget.parent_name}</span>}
                  </span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {manage && (
                    <Menu label={`خيارات ميزانية ${budget.category_name}`}>
                      <MenuItem icon="edit" onClick={() => setForm({ budget })}>تعديل</MenuItem>
                      <MenuItem icon="trash" danger onClick={() => remove(budget)}>حذف</MenuItem>
                    </Menu>
                  )}
                </span>
              </div>
              <Progress valueBps={budget.used_bps} status={budget.status} markerBps={budget.alert_bps} label={budget.category_name} />
              <div className="figures">
                <span>
                  <span className="num bold">{formatMoney(budget.spent_minor, currency)}</span> من <span className="num">{formatMoney(budget.amount_minor, currency)}</span>
                  {' '}(<span className="num">{formatBps(budget.used_bps)}</span>)
                </span>
                <span className={budget.remaining_minor < 0 ? 'amount-expense' : ''}>
                  {budget.remaining_minor >= 0 ? 'فاضل ' : 'عدّيت بـ '}
                  <span className="num bold">{formatMoney(Math.abs(budget.remaining_minor), currency)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </Card>

      <BudgetForm
        open={Boolean(form)}
        budget={form?.budget}
        usedCategoryIds={new Set(list.map((budget) => budget.category_id))}
        onClose={() => setForm(null)}
      />
    </div>
  );
}
