/**
 * الرئيسية: صورة الشهر المالي الحالي في نظرة واحدة —
 * دخل/مصروف/متبقّي، ووتيرة الصرف مقارنةً بالوقت، وآخر العمليات،
 * والميزانيات الأقرب للحدّ، وأرصدة الحسابات.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { firstName, formatBps, formatMoney, formatMonth } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { currentMonth, todayIn } from '../lib/period.js';
import { ACCOUNT_TYPE, BUDGET_STATUS } from '../lib/constants.js';
import { Icon } from '../lib/icons.jsx';
import { useAccounts } from '../lib/queries.js';
import TransactionList from '../components/transactions/TransactionList.jsx';
import { useQuickAdd } from '../components/transactions/QuickAdd.jsx';
import {
  Badge, Button, Card, CategoryIcon, EmptyState, ErrorState, ListSkeleton, Money, PageHead, Progress, Skeleton,
} from '../components/ui/index.js';

function MonthHero({ summary, currency }) {
  const { totals, period } = summary;
  const spentBps = totals.income_minor > 0 ? Math.round((totals.expense_minor * 10_000) / totals.income_minor) : 0;
  const timeBps = Math.round((period.elapsed_days * 10_000) / period.days);
  const status = spentBps > 10_000 ? 'over' : spentBps > timeBps + 1000 ? 'warning' : 'ok';

  return (
    <section className="card month-hero" aria-label="ملخّص الشهر">
      <div className="figures">
        <div className="figure">
          <span className="label"><Icon name="arrow-down" size={16} style={{ color: 'var(--income)' }} />الدخل</span>
          <span className="value"><Money minor={totals.income_minor} currency={currency} compact /></span>
        </div>
        <div className="figure">
          <span className="label"><Icon name="arrow-up" size={16} style={{ color: 'var(--expense)' }} />المصروف</span>
          <span className="value"><Money minor={totals.expense_minor} currency={currency} compact /></span>
        </div>
        <div className="figure net">
          <span className="label">المتبقّي من الشهر</span>
          <span className="value"><Money minor={totals.net_minor} currency={currency} tone="auto" compact /></span>
        </div>
      </div>
      {totals.income_minor > 0 && (
        <div className="stack sm">
          <Progress valueBps={spentBps} status={status} markerBps={period.is_current ? timeBps : undefined} label="المصروف من الدخل" />
          <div className="pace">
            <span>صرفت <span className="num">{formatBps(spentBps)}</span> من دخل الشهر</span>
            {period.is_current && <span>مضى <span className="num">{period.elapsed_days}</span> يوم من <span className="num">{period.days}</span></span>}
          </div>
        </div>
      )}
    </section>
  );
}

function BudgetsCard({ month, currency }) {
  const budgets = useQuery({ queryKey: ['budgets', month], queryFn: () => api.get('/budgets', { month }) });
  const top = [...(budgets.data?.budgets ?? [])].sort((a, b) => b.used_bps - a.used_bps).slice(0, 4);

  return (
    <Card title="الميزانيات" actions={<Link to="/budgets" className="small">الكل</Link>} flush>
      {budgets.isLoading && <div className="card-body"><Skeleton height={60} /></div>}
      {budgets.isSuccess && top.length === 0 && (
        <EmptyState emoji="🎯" title="مفيش ميزانيات لسه" description="حدّد سقف شهري للأكل أو المواصلات وهننبّهك قبل ما تعدّيه." action={<Link to="/budgets" className="btn secondary sm">ضيف ميزانية</Link>} />
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

function AccountsCard({ accounts, currency }) {
  const counted = accounts.filter((account) => account.include_in_net_worth);
  const total = counted.reduce((sum, account) => sum + account.balance_minor, 0);
  return (
    <Card title="الحسابات" actions={<Link to="/accounts" className="small">الكل</Link>} flush footer={(
      <div className="row between"><span className="muted small">صافي الثروة</span><Money minor={total} currency={currency} tone="auto" className="bold" /></div>
    )}>
      <div className="list">
        {accounts.slice(0, 6).map((account) => (
          <Link key={account.id} className="list-item" to={`/transactions?account_id=${account.id}&month=all`}>
            <span className="cat-icon sm" style={{ '--cat': account.color }}><Icon name={ACCOUNT_TYPE[account.type]?.icon ?? 'wallet'} size={16} /></span>
            <span className="grow truncate">{account.name}{!account.is_shared && <span className="xsmall faint"> · خاص</span>}</span>
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
  const daysLeft = summary.data?.period.is_current ? summary.data.period.days - summary.data.period.elapsed_days : null;

  return (
    <div className="page">
      <PageHead
        title={`أهلًا ${firstName(user.full_name)} 👋`}
        description={(
          <>
            {formatMonth(month)}
            {daysLeft !== null && <> · فاضل <span className="num">{daysLeft}</span> يوم على آخر الشهر</>}
          </>
        )}
      />

      {noAccounts ? (
        <Card>
          <EmptyState
            emoji="👛"
            title="ابدأ بحساباتك"
            description="ضيف الأماكن اللي فلوسك فيها: الكاش اللي معاك، حسابك في البنك، فودافون كاش… وبعدها سجّل أول مصروف."
            action={<Link to="/accounts?new=1" className="btn primary">ضيف أول حساب</Link>}
          />
        </Card>
      ) : (
        <>
          {summary.isLoading && <Skeleton height={150} style={{ borderRadius: 12 }} />}
          {summary.isError && <ErrorState error={summary.error} onRetry={summary.refetch} />}
          {summary.data && <MonthHero summary={summary.data} currency={currency} />}

          <div className="grid split">
            <Card
              title="آخر العمليات"
              actions={<Link to="/transactions" className="small">كل العمليات</Link>}
              flush
            >
              {recent.isLoading && <ListSkeleton rows={4} />}
              {recent.isError && <ErrorState error={recent.error} onRetry={recent.refetch} />}
              {recent.data?.rows.length === 0 && (
                <EmptyState
                  emoji="🧾"
                  title="لسه مفيش عمليات"
                  description="سجّل أي مصروف أو دخل وهيظهر هنا."
                  action={<Button variant="primary" icon="plus" onClick={() => openTransaction()}>سجّل أول عملية</Button>}
                />
              )}
              {recent.data?.rows.length > 0 && <TransactionList rows={recent.data.rows} today={today} currency={currency} />}
            </Card>

            <div className="stack">
              {can('budgets.read') && <BudgetsCard month={month} currency={currency} />}
              {accounts.data?.length > 0 && <AccountsCard accounts={accounts.data} currency={currency} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
