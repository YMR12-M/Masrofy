/**
 * الفواتير والأقساط: «اللي عليّ» ومواعيده.
 * تبويب المواعيد (متأخرة · النهارده · الأسبوع ده · بعد كده) بزرار «دفعت»
 * يسجّل العملية بضغطة، وتبويب للفواتير المتكرّرة، وتبويب للتقسيط بجدوله.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { countText, describeSchedule } from '../lib/bills.js';
import { formatDayMonth, formatMoney, formatSigned } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { addDays, todayIn } from '../lib/period.js';
import { useDueBills, useInstallmentPlans, useRecurringRules } from '../lib/queries.js';
import DueList, { BillIcon } from '../components/bills/DueList.jsx';
import InstallmentForm from '../components/bills/InstallmentForm.jsx';
import PlanDetail from '../components/bills/PlanDetail.jsx';
import RecurringForm from '../components/bills/RecurringForm.jsx';
import { Icon } from '../lib/icons.jsx';
import {
  Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, MoneyFigure, PageHead, Plate, Progress, Tabs,
} from '../components/ui/index.js';

/** «القريب» في الصفحة: شهر من النهارده */
const HORIZON_DAYS = 30;
const PROBLEMS = { account_archived: 'الحساب مؤرشف', category_archived: 'التصنيف مؤرشف' };

/** لوحة الصفحة: كل اللي عليك لحد شهر من النهارده، ومنه المتأخر، والدخل الجاي */
function Summary({ items, currency }) {
  const owed = (list) => list.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount_minor, 0);
  const overdue = items.filter((item) => item.status === 'overdue');
  const coming = items.filter((item) => item.status !== 'overdue');
  const income = coming.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount_minor, 0);
  const overdueMinor = owed(overdue);
  return (
    <Plate aria-label="ملخّص الفواتير">
      <span className="plate-label">عليك لحد {HORIZON_DAYS} يوم من النهارده</span>
      <MoneyFigure className="plate-figure" minor={overdueMinor + owed(coming)} currency={currency} compact />
      <div className="plate-row">
        <span style={overdue.length ? { color: 'var(--expense-on-ink)' } : undefined}>
          <Icon name="alert" size={16} />
          {overdue.length
            ? <>منه متأخر <b className="num">{formatMoney(overdueMinor, currency, { compact: true })}</b> ({countText(overdue.length, { one: 'معاد فات', two: 'معادين فاتوا', few: 'مواعيد فاتت', many: 'معاد فات' })})</>
            : 'مفيش حاجة متأخرة'}
        </span>
        {income > 0 && <span><Icon name="arrow-down" size={16} />دخل جاي <b className="num">{formatMoney(income, currency, { compact: true })}</b></span>}
      </div>
    </Plate>
  );
}

function RuleRow({ rule, currency, onOpen }) {
  const ended = !rule.next_due_on;
  const meta = [describeSchedule(rule), rule.type === 'transfer' ? `${rule.account_name} ← ${rule.to_account_name}` : rule.account_name];
  if (rule.remaining_count !== null && !ended) meta.push(`فاضل ${countText(rule.remaining_count, { one: 'مرة', two: 'مرتين', few: 'مرات', many: 'مرة' })}`);
  return (
    <button type="button" className={`list-item ${ended ? 'ended' : ''}`} onClick={() => onOpen(rule)}>
      <BillIcon item={{ ...rule, category_icon: rule.category_icon ?? rule.parent_category_icon }} />
      <span className="grow stack sm" style={{ gap: 2 }}>
        <span className="title truncate">{rule.name}</span>
        <span className="meta tx-sub">
          <span className="truncate">{meta.join(' · ')}</span>
          {rule.auto_post && <Badge tone="primary">تلقائي</Badge>}
          {rule.problem && <Badge tone="warning">{PROBLEMS[rule.problem]}</Badge>}
        </span>
      </span>
      <span className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
        <span className={`tx-amount num amount-${rule.type}`}>{formatSigned(rule.amount_minor, rule.type, currency)}</span>
        <span className="xsmall faint">{ended ? 'خلصت' : `الجاية ${formatDayMonth(rule.next_due_on)}`}</span>
      </span>
    </button>
  );
}

function PlanCard({ plan, currency, onOpen }) {
  const next = plan.next_item;
  return (
    <button type="button" className={`card plan-card ${plan.done ? 'done' : ''}`} onClick={() => onOpen(plan)}>
      <div className="row between start">
        <div style={{ minWidth: 0 }}>
          <div className="bold truncate">{plan.name}</div>
          <div className="xsmall faint truncate">{[plan.payee, plan.account_name].filter(Boolean).join(' · ')}</div>
        </div>
        {plan.done && <Badge tone="income">خلصت</Badge>}
        {!plan.done && plan.overdue_count > 0 && <Badge tone="danger">{countText(plan.overdue_count, { one: 'قسط متأخر', two: 'قسطين متأخرين', few: 'أقساط متأخرة', many: 'قسط متأخر' })}</Badge>}
        {!plan.done && !plan.overdue_count && plan.problem && <Badge tone="warning">{PROBLEMS[plan.problem]}</Badge>}
      </div>
      <Progress valueBps={plan.paid_bps} status={plan.done ? 'ok' : plan.overdue_count ? 'warning' : ''} label={`المدفوع من ${plan.name}`} />
      <div className="row between wrap xsmall muted">
        <span><span className="num bold">{formatMoney(plan.paid_minor, currency)}</span> من <span className="num">{formatMoney(plan.total_minor, currency)}</span></span>
        <span>اتدفع <span className="num">{plan.installments_paid}</span> من <span className="num">{plan.installment_count}</span></span>
      </div>
      {next && (
        <div className="plan-next small">
          {next.seq === 0 ? 'المقدّم' : 'القسط الجاي'}: <span className="num bold">{formatMoney(next.amount_minor, currency)}</span>
          <span className="muted"> · {formatDayMonth(next.due_on)}</span>
        </div>
      )}
    </button>
  );
}

export default function Bills() {
  useDocumentTitle('الفواتير والأقساط');
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const currency = user.household.currency;
  const today = todayIn(user.household.timezone);
  const canWrite = can('transactions.write') || can('accounts.own');

  const [tab, setTab] = useState(() => (['due', 'recurring', 'installments'].includes(params.get('tab')) ? params.get('tab') : 'due'));
  const [ruleForm, setRuleForm] = useState(() => (params.get('new') === 'recurring' ? {} : null));
  const [planForm, setPlanForm] = useState(() => (params.get('new') === 'installment' ? {} : null));
  const [planDetail, setPlanDetail] = useState(null);

  const due = useDueBills({ to: addDays(today, HORIZON_DAYS) });
  const rules = useRecurringRules();
  const plans = useInstallmentPlans();
  const items = due.data?.items ?? [];

  const closeForms = () => {
    setRuleForm(null);
    setPlanForm(null);
    if (params.get('new')) setParams({}, { replace: true });
  };

  function openSource(item) {
    if (item.source === 'installment') { setPlanDetail(item.source_id); return; }
    const rule = rules.data?.find((entry) => entry.id === item.source_id);
    if (rule) setRuleForm({ rule });
  }

  const empty = (
    <EmptyState
      icon="receipt"
      title="مفيش فواتير ولا أقساط لسه"
      description="سجّل الإيجار والنت والاشتراكات والمرتب مرة واحدة، أو حاجة اشتريتها بالتقسيط، وهنفكّرك بمعادها وتسجّلها بضغطة."
      action={canWrite && (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <Button variant="primary" icon="plus" onClick={() => setRuleForm({})}>فاتورة متكرّرة</Button>
          <Button icon="plus" onClick={() => setPlanForm({})}>تقسيط</Button>
        </div>
      )}
    />
  );
  const nothingYet = rules.isSuccess && plans.isSuccess && rules.data.length === 0 && plans.data.length === 0;

  return (
    <div className="page">
      <PageHead
        title="الفواتير والأقساط"
        description="اللي عليك ومواعيده، وتسجّله بضغطة لما تدفع"
        actions={canWrite && (
          <>
            <Button variant="primary" icon="plus" onClick={() => setRuleForm({})}>فاتورة متكرّرة</Button>
            <Button icon="plus" onClick={() => setPlanForm({})}>تقسيط</Button>
          </>
        )}
      />

      {due.data && !nothingYet && <Summary items={items} currency={currency} />}

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'due', label: 'المواعيد', count: due.data ? items.length : undefined },
          { id: 'recurring', label: 'الفواتير', count: rules.data?.length },
          { id: 'installments', label: 'التقسيط', count: plans.data?.length },
        ]}
      />

      {tab === 'due' && (
        <Card flush>
          {due.isLoading && <ListSkeleton rows={4} />}
          {due.isError && <ErrorState error={due.error} onRetry={due.refetch} />}
          {due.isSuccess && items.length === 0 && (nothingYet ? empty : (
            <EmptyState icon="check" title="مفيش حاجة مستحقّة" description={`مفيش مواعيد متأخرة ولا جاية خلال ${HORIZON_DAYS} يوم.`} />
          ))}
          {items.length > 0 && <DueList items={items} today={due.data.today} currency={currency} onOpenSource={openSource} />}
        </Card>
      )}

      {tab === 'recurring' && (
        <Card flush>
          {rules.isLoading && <ListSkeleton rows={4} />}
          {rules.isError && <ErrorState error={rules.error} onRetry={rules.refetch} />}
          {rules.isSuccess && rules.data.length === 0 && (
            <EmptyState
              icon="repeat"
              title="مفيش فواتير متكرّرة"
              description="الإيجار، النت، الكهربا، نتفليكس، المرتب… سجّلها مرة واحدة وهتظهر في مواعيدها."
              action={canWrite && <Button variant="primary" icon="plus" onClick={() => setRuleForm({})}>ضيف فاتورة</Button>}
            />
          )}
          <div className="list">
            {(rules.data ?? []).map((rule) => <RuleRow key={rule.id} rule={rule} currency={currency} onOpen={(entry) => setRuleForm({ rule: entry })} />)}
          </div>
        </Card>
      )}

      {tab === 'installments' && (
        <>
          {plans.isLoading && <ListSkeleton rows={3} />}
          {plans.isError && <ErrorState error={plans.error} onRetry={plans.refetch} />}
          {plans.isSuccess && plans.data.length === 0 && (
            <Card>
              <EmptyState
                icon="card"
                title="مفيش تقسيط"
                description="اشتريت تلاجة أو موبايل بالتقسيط؟ اكتب الإجمالي والمقدّم وعدد الأقساط، وهنعمل لك الجدول ونفكّرك بكل قسط."
                action={canWrite && <Button variant="primary" icon="plus" onClick={() => setPlanForm({})}>ضيف تقسيط</Button>}
              />
            </Card>
          )}
          <div className="plans-grid">
            {(plans.data ?? []).map((plan) => <PlanCard key={plan.id} plan={plan} currency={currency} onOpen={(entry) => setPlanDetail(entry.id)} />)}
          </div>
        </>
      )}

      <RecurringForm open={Boolean(ruleForm)} rule={ruleForm?.rule} onClose={closeForms} />
      <InstallmentForm open={Boolean(planForm)} plan={planForm?.plan} onClose={closeForms} />
      <PlanDetail planId={planDetail} onClose={() => setPlanDetail(null)} onEdit={(plan) => setPlanForm({ plan })} />
    </div>
  );
}
