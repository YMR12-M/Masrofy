/**
 * جدول خطّة التقسيط: المدفوع والمتبقّي، وصفّ لكل قسط بحالته.
 * القسط غير المدفوع له «دفعت» (مصروف حقيقي) أو «اتدفع قبل كده» (علامة بلا
 * عملية). المدفوع بعملية يفتحها — وحذفها من هناك يرجّع القسط مستحقًّا.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { dueLabel, installmentLabel } from '../../lib/bills.js';
import { formatDayMonth, formatMoney } from '../../lib/format.js';
import { todayIn } from '../../lib/period.js';
import { Icon } from '../../lib/icons.jsx';
import { useRefreshMoney } from '../../lib/queries.js';
import { useQuickAdd } from '../transactions/QuickAdd.jsx';
import {
  Badge, Button, ErrorState, ListSkeleton, Menu, MenuItem, Modal, MoneyFigure, Notice, Progress, Skeleton, useConfirm,
} from '../ui/index.js';
import PostDialog from './PostDialog.jsx';
import { useBillActions } from './useBillActions.js';

/** صفّ الجدول بشكل بنود «اللي عليّ» عشان نفس الإجراءات تشتغل عليه */
const asDueItem = (plan, item) => ({
  key: `installment:${plan.id}:${item.id}`,
  source: 'installment',
  source_id: plan.id,
  item_id: item.id,
  due_on: item.due_on,
  name: plan.name,
  type: 'expense',
  amount_minor: item.amount_minor,
  account_id: plan.account_id,
  account_name: plan.account_name,
  to_account_id: null,
  installment: { seq: item.seq, count: plan.installment_count },
});

function ScheduleRow({
  plan, item, today, currency, actions, onDetails, onOpenTransaction,
}) {
  const due = asDueItem(plan, item);
  const busy = actions.busy === due.key;
  return (
    <div className={`bill-row ${item.paid ? 'done' : item.status}`}>
      <span className="seq num" aria-hidden="true">{item.seq === 0 ? <Icon name="cash" size={16} /> : item.seq}</span>
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="title">{installmentLabel(due.installment)}</span>
        <span className="bill-meta">
          <span>{formatDayMonth(item.due_on)}</span>
          {!item.paid && item.status !== 'today' && <span>· {dueLabel(item.due_on, today)}</span>}
          {item.status === 'overdue' && <Badge tone="danger">متأخر</Badge>}
          {item.status === 'today' && <Badge tone="warning">النهارده</Badge>}
          {item.status === 'paid' && <Badge tone="income">اتدفع{item.paid_on ? ` ${formatDayMonth(item.paid_on)}` : ''}</Badge>}
          {item.status === 'settled' && <Badge>اتدفع قبل التطبيق</Badge>}
        </span>
      </div>
      <span className="bill-amount num">{formatMoney(item.amount_minor, currency)}</span>
      {plan.can_edit && (
        <div className="bill-actions">
          {!item.paid && (
            <Button size="sm" variant={item.status === 'upcoming' ? 'secondary' : 'primary'} icon="check" loading={busy} disabled={Boolean(actions.busy) || Boolean(plan.problem)} onClick={() => actions.post(due)} aria-label={`دفعت ${installmentLabel(due.installment)}`}>
              دفعت
            </Button>
          )}
          <Menu label={`خيارات ${installmentLabel(due.installment)}`}>
            {!item.paid && <MenuItem icon="edit" onClick={() => onDetails(due)}>بتاريخ أو حساب تاني…</MenuItem>}
            {!item.paid && <MenuItem icon="archive" onClick={() => actions.settle(due)}>اتدفع قبل كده</MenuItem>}
            {item.status === 'settled' && <MenuItem icon="restore" onClick={() => actions.settle(due, false)}>شيل علامة «اتدفع»</MenuItem>}
            {item.transaction_id && <MenuItem icon="eye" onClick={() => onOpenTransaction(item.transaction_id)}>فتح العملية</MenuItem>}
          </Menu>
        </div>
      )}
    </div>
  );
}

function PlanDetailDialog({
  planId, onClose, onEdit,
}) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  const openTransaction = useQuickAdd();
  const actions = useBillActions();
  const [details, setDetails] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const currency = user.household.currency;
  const today = todayIn(user.household.timezone);

  const detail = useQuery({ queryKey: ['bills', 'installment', planId], queryFn: () => api.get(`/installments/${planId}`) });
  const plan = detail.data;

  async function openTx(id) {
    try {
      const transaction = await api.get(`/transactions/${id}`);
      onClose();
      openTransaction({ transaction });
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `حذف خطّة «${plan.name}»؟`,
      message: 'الجدول هيتمسح. الأقساط اللي اتسجّلت كمصروف قبل كده هتفضل في العمليات زي ما هي.',
      danger: true,
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.del(`/installments/${plan.id}`);
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      refreshMoney();
      toast.success('اتحذفت الخطّة');
      onClose();
    } catch (error) {
      toast.error(error.message);
      setDeleting(false);
    }
  }

  const footer = (
    <>
      {plan?.can_edit && <Button variant="danger-ghost" icon="trash" onClick={remove} loading={deleting} style={{ marginInlineEnd: 'auto' }}>حذف</Button>}
      {plan?.can_edit && <Button icon="edit" onClick={() => { onClose(); onEdit(plan); }}>تعديل</Button>}
      <Button variant="primary" onClick={onClose}>تمام</Button>
    </>
  );

  return (
    <Modal open onClose={onClose} size="wide" title={plan?.name ?? 'خطّة التقسيط'} footer={footer}>
      {detail.isLoading && (
        <div className="stack" aria-hidden="true">
          <Skeleton height={96} />
          <div className="card schedule"><ListSkeleton rows={4} /></div>
        </div>
      )}
      {detail.isError && <ErrorState error={detail.error} onRetry={detail.refetch} />}
      {plan && (
        <div className="stack">
          <div className="figure-panel stacked">
            <div className="row between wrap">
              <div>
                <span className="label">{plan.done ? 'اتدفع كله' : 'فاضل عليك'}</span>
                <MoneyFigure minor={plan.done ? plan.total_minor : plan.remaining_minor} currency={currency} size="lg" compact />
              </div>
              <div className="side">
                <span>اتدفع <b className="num">{formatMoney(plan.paid_minor, currency)}</b> من <b className="num">{formatMoney(plan.total_minor, currency)}</b></span>
                <span><b className="num">{plan.installments_paid}</b> من <b className="num">{plan.installment_count}</b> قسط</span>
              </div>
            </div>
            <Progress valueBps={plan.paid_bps} status={plan.done ? 'ok' : plan.overdue_count > 0 ? 'warning' : ''} label="المدفوع من الإجمالي" />
            {[plan.payee, plan.account_name, plan.category_name].some(Boolean) && (
              <span className="xsmall muted">{[plan.payee, plan.account_name, plan.category_name].filter(Boolean).join(' · ')}</span>
            )}
          </div>
          {plan.problem && (
            <Notice tone="warning" icon="alert">
              {plan.problem === 'account_archived' ? 'حساب الخطّة اتأرشف. عدّلها واختار حساب تاني عشان تسجّل الأقساط.' : 'تصنيف الخطّة اتأرشف. عدّلها واختار تصنيف تاني.'}
            </Notice>
          )}
          {plan.done && <Notice tone="success" icon="check">خلصت الأقساط كلها.</Notice>}
          <div className="card schedule">
            {plan.items.map((item) => (
              <ScheduleRow key={item.id} plan={plan} item={item} today={today} currency={currency} actions={actions} onDetails={setDetails} onOpenTransaction={openTx} />
            ))}
          </div>
        </div>
      )}
      <PostDialog item={details} onPost={actions.post} onClose={() => setDetails(null)} />
    </Modal>
  );
}

export default function PlanDetail({ planId, ...props }) {
  return planId ? <PlanDetailDialog planId={planId} {...props} /> : null;
}
