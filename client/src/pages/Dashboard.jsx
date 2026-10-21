/**
 * الرئيسية: صورة الشهر المالي الحالي في نظرة واحدة. لوحة الشهر (المتبقّي،
 * الدخل والمصروف، ووردة الوتيرة)، ثم آخر العمليات، والفواتير القريبة،
 * والميزانيات الأقرب للحدّ، وأرصدة الحسابات.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { firstName, formatBps, formatDayMonth, formatMoney, formatMonth } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { addDays, currentMonth, periodRange, todayIn } from '../lib/period.js';
import { BUDGET_STATUS } from '../lib/constants.js';
import { Icon } from '../lib/icons.jsx';
import { useAccounts, useDueBills } from '../lib/queries.js';
import { countText } from '../lib/bills.js';
import DueList from '../components/bills/DueList.jsx';
import TransactionList from '../components/transactions/TransactionList.jsx';
import { useQuickAdd } from '../components/transactions/QuickAdd.jsx';
import {
  AccountMark, Badge, Button, Card, CardLink, CategoryIcon, EmptyState, ErrorState, ListSkeleton, Money, MoneyFigure,
  Plate, Progress, Rosette, Skeleton,
} from '../components/ui/index.js';

/** «يوم» بعد الرقم: 1 يوم، 2 يومين، 3 لـ 10 أيام، وبعدها يوم */
const dayUnit = (count) => (count === 2 ? 'يومين' : count >= 3 && count <= 10 ? 'أيام' : 'يوم');

/** خطّ صغير بلون حلقة الوردة: المفتاح جوّه الجملة نفسها */
const Swatch = ({ color }) => <i className="swatch" style={{ borderColor: color }} aria-hidden="true" />;

/**
 * لوحة الشهر: المتبقّي بشكل فئة الورقة، والدخل والمصروف، والوردة اللي بتقارن
 * المصروف من الدخل (دهبي) باللي عدّى من الشهر (أبيض).
 */
function MonthPlate({ summary, currency }) {
  const { totals, period } = summary;
  const spentBps = totals.income_minor > 0 ? Math.round((totals.expense_minor * 10_000) / totals.income_minor) : null;
  const timeBps = period.is_current ? Math.round((period.elapsed_days * 10_000) / period.days) : 10_000;
  const daysLeft = period.days - period.elapsed_days;
  const status = spentBps === null ? '' : spentBps > 10_000 ? 'over' : spentBps > timeBps + 1000 ? 'warning' : 'ok';

  let note;
  if (spentBps === null) {
    note = 'مفيش دخل متسجّل في الشهر ده، فمش هنقدر نقارن المصروف بيه.';
  } else if (status === 'over') {
    note = <>المصروف عدّى الدخل بـ <span className="num">{formatMoney(-totals.net_minor, currency, { compact: true })}</span></>;
  } else if (period.is_current) {
    note = (
      <>
        {status === 'warning' && 'بتصرف أسرع من الشهر: '}
        <Swatch color="var(--gold-bright)" />صرفت <span className="num">{formatBps(spentBps)}</span> من الدخل،{' '}
        <Swatch color="var(--on-ink)" />وعدّى <span className="num">{formatBps(timeBps)}</span> من أيام الشهر
      </>
    );
  } else {
    note = <><Swatch color="var(--gold-bright)" />صرفت <span className="num">{formatBps(spentBps)}</span> من دخل الشهر</>;
  }

  const label = spentBps === null
    ? `مضى ${formatBps(timeBps)} من الشهر، ومفيش دخل متسجّل`
    : `صرفت ${formatBps(spentBps)} من الدخل، ومضى ${formatBps(timeBps)} من الشهر`;

  return (
    <Plate
      aria-label="ملخّص الشهر"
      aside={(
        <Rosette timeBps={timeBps} spendBps={spentBps} label={label}>
          {period.is_current
            ? <><small>فاضل</small><span className="num">{daysLeft}</span><small>{dayUnit(daysLeft)}</small></>
            : <><span className="num">{spentBps === null ? '0%' : formatBps(spentBps)}</span><small>من الدخل</small></>}
        </Rosette>
      )}
    >
      <span className="plate-label">{period.is_current ? 'المتبقّي من الشهر' : 'صافي الشهر'}</span>
      <MoneyFigure
        className={`plate-figure ${totals.net_minor < 0 ? 'negative' : ''}`}
        minor={totals.net_minor}
        currency={currency}
        compact
      />
      <div className="plate-row">
        <span><Icon name="arrow-down" size={16} />دخل <b className="num">{formatMoney(totals.income_minor, currency, { compact: true })}</b></span>
        <span><Icon name="arrow-up" size={16} />مصروف <b className="num">{formatMoney(totals.expense_minor, currency, { compact: true })}</b></span>
      </div>
      <p className={`plate-note ${status}`}>{note}</p>
    </Plate>
  );
}

function BudgetsCard({ month, currency }) {
  const budgets = useQuery({ queryKey: ['budgets', month], queryFn: () => api.get('/budgets', { month }) });
  const top = [...(budgets.data?.budgets ?? [])].sort((a, b) => b.used_bps - a.used_bps).slice(0, 4);

  return (
    <Card title="الميزانيات" actions={<CardLink to="/budgets" />} flush>
      {budgets.isLoading && <div className="card-body"><Skeleton height={60} /></div>}
      {budgets.isSuccess && top.length === 0 && (
        <EmptyState icon="target" title="مفيش ميزانيات لسه" description="حدّد سقف شهري للأكل أو المواصلات وهننبّهك قبل ما تعدّيه." action={<Link to="/budgets" className="btn secondary sm">ضيف ميزانية</Link>} />
      )}
      {top.map((budget) => (
        <div key={budget.id} className="budget-row">
          <div className="row between">
            <span className="row truncate" style={{ gap: 8 }}>
              <CategoryIcon icon={budget.category_icon ?? budget.parent_icon} color={budget.category_color} size="sm" />
              <span className="truncate">{budget.category_name}</span>
            </span>
            <Badge tone={BUDGET_STATUS[budget.status].tone}>{formatBps(budget.used_bps)}</Badge>
          </div>
          <Progress valueBps={budget.used_bps} status={budget.status} markerBps={budget.alert_bps} label={budget.category_name} />
          <div className="figures">
            <span><span className="num">{formatMoney(budget.spent_minor, currency)}</span> من <span className="num">{formatMoney(budget.amount_minor, currency)}</span></span>
          </div>
        </div>
      ))}
    </Card>
  );
}

/** الأيام اللي تعتبرها الرئيسية «قريبة» */
const SOON_DAYS = 7;
const SOON_LIMIT = 5;

/** فواتير قريبة: المتأخر واللي جاي خلال أسبوع، بزرار «دفعت» */
function BillsCard({ today, currency }) {
  const due = useDueBills({ to: addDays(today, SOON_DAYS) });
  if (!due.data) return due.isLoading ? <Skeleton height={120} style={{ borderRadius: 14 }} /> : null;

  const { items, sources } = due.data;
  const shown = items.slice(0, SOON_LIMIT);
  const hasSources = sources.recurring + sources.installments > 0;
  const overdue = items.filter((item) => item.status === 'overdue').length;

  return (
    <Card
      title="فواتير قريبة"
      actions={<CardLink to="/bills" />}
      flush
      footer={items.length > SOON_LIMIT && (
        <Link to="/bills" className="small">و<span className="num">{items.length - SOON_LIMIT}</span> كمان خلال الأسبوع</Link>
      )}
    >
      {!hasSources && (
        <div className="card-body stack sm">
          <p className="muted small">سجّل الإيجار والنت والأقساط مرة واحدة، ونفكّرك بمعادها وتسجّلها بضغطة.</p>
          <Link to="/bills?new=recurring" className="btn secondary sm" style={{ alignSelf: 'flex-start' }}>ضيف فاتورة متكرّرة</Link>
        </div>
      )}
      {hasSources && items.length === 0 && (
        <div className="card-body row" style={{ gap: 8 }}>
          <Icon name="check" size={18} style={{ color: 'var(--income)' }} />
          <span className="muted small">مفيش فواتير الأسبوع ده</span>
        </div>
      )}
      {overdue > 0 && <div className="list-group-head danger"><span>عليك {countText(overdue, { one: 'معاد متأخر', two: 'معادين متأخرين', few: 'مواعيد متأخرة', many: 'معاد متأخر' })}</span></div>}
      {shown.length > 0 && <DueList items={shown} today={due.data.today} currency={currency} compact />}
    </Card>
  );
}

function AccountsCard({ accounts, currency }) {
  const counted = accounts.filter((account) => account.include_in_net_worth);
  const total = counted.reduce((sum, account) => sum + account.balance_minor, 0);
  return (
    <Card title="الحسابات" actions={<CardLink to="/accounts" />} flush footer={(
      <div className="row between"><span className="muted small">صافي الثروة</span><Money minor={total} currency={currency} tone="auto" className="bold" /></div>
    )}>
      <div className="list">
        {accounts.slice(0, 6).map((account) => (
          <Link key={account.id} className="list-item" to={`/transactions?account_id=${account.id}&month=all`}>
            <AccountMark account={account} size="sm" />
            <span className="grow truncate">{account.name}</span>
            {!account.is_shared && <Icon name="lock" size={14} className="faint" />}
            <Money minor={account.balance_minor} currency={currency} tone="auto" className="bold small" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  useDocumentTitle('الرئيسية');
  const { user, can } = useAuth();
  const openTransaction = useQuickAdd();
  const { currency, timezone } = user.household;
  const month = currentMonth(user.household);
  const today = todayIn(timezone);
  const seesMoney = can('accounts.read') || can('accounts.own');

  const accounts = useAccounts({ enabled: seesMoney });
  const summary = useQuery({
    queryKey: ['reports', 'summary', month],
    queryFn: () => api.get('/reports/summary', { month }),
    enabled: can('reports.read'),
  });
  const recent = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.page('/transactions', { page_size: 8 }),
    enabled: seesMoney,
  });

  const noAccounts = accounts.isSuccess && accounts.data.length === 0;
  const startDay = user.household.month_start_day;
  const range = periodRange(month, startDay);

  return (
    <div className="page">
      <header className="greeting">
        <h1>أهلًا {firstName(user.full_name)}</h1>
        <p>
          {formatMonth(month)}
          {startDay !== 1 && <>، من <span className="num">{formatDayMonth(range.from)}</span> لـ <span className="num">{formatDayMonth(range.to)}</span></>}
        </p>
      </header>

      {noAccounts ? (
        <Card>
          <EmptyState
            icon="wallet"
            title="ابدأ بحساباتك"
            description="ضيف الأماكن اللي فلوسك فيها: الكاش اللي معاك، حسابك في البنك، فودافون كاش… وبعدها سجّل أول مصروف."
            action={<Link to="/accounts?new=1" className="btn primary">ضيف أول حساب</Link>}
          />
        </Card>
      ) : (
        <>
          {summary.isLoading && <Skeleton height={236} style={{ borderRadius: 20 }} />}
          {summary.isError && <Card><ErrorState error={summary.error} onRetry={summary.refetch} /></Card>}
          {summary.data && <MonthPlate summary={summary.data} currency={currency} />}

          <div className="grid split">
            <Card
              title="آخر العمليات"
              actions={<CardLink to="/transactions">كل العمليات</CardLink>}
              flush
            >
              {recent.isLoading && <ListSkeleton rows={4} />}
              {recent.isError && <ErrorState error={recent.error} onRetry={recent.refetch} />}
              {recent.data?.rows.length === 0 && (
                <EmptyState
                  icon="receipt"
                  title="لسه مفيش عمليات"
                  description="سجّل أي مصروف أو دخل وهيظهر هنا."
                  action={<Button variant="primary" icon="plus" onClick={() => openTransaction()}>سجّل أول عملية</Button>}
                />
              )}
              {recent.data?.rows.length > 0 && <TransactionList rows={recent.data.rows} today={today} currency={currency} />}
            </Card>

            <div className="stack">
              <BillsCard today={today} currency={currency} />
              {can('budgets.read') && <BudgetsCard month={month} currency={currency} />}
              {accounts.data?.length > 0 && <AccountsCard accounts={accounts.data} currency={currency} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
