/**
 * التقارير: أرقام الشهر مقارنةً بالشهر اللي قبله، الصرف حسب التصنيف،
 * الصرف اليومي، واتجاه الدخل والمصروف لآخر 6 شهور.
 * كله محسوب على الحسابات الظاهرة لك فقط.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { formatBps, formatDayMonth, formatMoney } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { currentMonth } from '../lib/period.js';
import { CategoryBars, ColumnsChart, Legend, trendPoints } from '../components/reports/Charts.jsx';
import {
  Card, EmptyState, ErrorState, MonthNav, PageHead, Segmented, Skeleton, Stat,
} from '../components/ui/index.js';

/** «+12% عن الشهر اللي فات» — للمصروف الزيادة سيّئة وللدخل جيّدة */
function change(current, previous, goodWhenUp) {
  if (!previous) return null;
  const bps = Math.round(((current - previous) * 10_000) / previous);
  if (bps === 0) return 'زي الشهر اللي فات';
  const up = bps > 0;
  const tone = up === goodWhenUp ? 'var(--income)' : 'var(--expense)';
  return <span style={{ color: tone }}>{up ? '▲' : '▼'} <span className="num">{formatBps(Math.abs(bps))}</span> عن الشهر اللي فات</span>;
}

export default function Reports() {
  useDocumentTitle('التقارير');
  const { user } = useAuth();
  const { currency, month_start_day: startDay } = user.household;
  const thisMonth = currentMonth(user.household);
  const [month, setMonth] = useState(thisMonth);
  const [kind, setKind] = useState('expense');

  const summary = useQuery({ queryKey: ['reports', 'summary', month], queryFn: () => api.get('/reports/summary', { month }) });
  const trend = useQuery({ queryKey: ['reports', 'trend', month], queryFn: () => api.get('/reports/trend', { months: 6, end: month }) });

  const data = summary.data;
  const items = data?.by_category[kind] ?? [];
  const hasDaily = data?.daily.some((day) => day.expense_minor > 0);

  return (
    <div className="page">
      <PageHead title="التقارير" description="فلوسك راحت فين، وبتتغيّر إزاي من شهر للتاني" />
      <div><MonthNav month={month} onChange={setMonth} startDay={startDay} /></div>

      {summary.isError && <ErrorState error={summary.error} onRetry={summary.refetch} />}
      {summary.isLoading && <div className="grid cols-4">{[1, 2, 3, 4].map((key) => <Skeleton key={key} height={96} style={{ borderRadius: 12 }} />)}</div>}

      {data && (
        <>
          <div className="grid cols-4">
            <Stat label="الدخل" icon="arrow-down" minor={data.totals.income_minor} currency={currency} tone="income" sub={change(data.totals.income_minor, data.previous.income_minor, true)} />
            <Stat label="المصروف" icon="arrow-up" minor={data.totals.expense_minor} currency={currency} tone="expense" sub={change(data.totals.expense_minor, data.previous.expense_minor, false)} />
            <Stat label="الصافي" minor={data.totals.net_minor} currency={currency} tone="auto" />
            <div className="card stat">
              <span className="label">نسبة الادخار</span>
              <span className="value num">{data.totals.savings_rate_bps === null ? '—' : formatBps(data.totals.savings_rate_bps)}</span>
              <span className="sub">من دخل الشهر</span>
            </div>
          </div>

          <div className="grid cols-2">
            <Card
              title={kind === 'expense' ? 'المصروف حسب التصنيف' : 'الدخل حسب المصدر'}
              actions={<Segmented label="النوع" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'مصروف' }, { value: 'income', label: 'دخل' }]} />}
            >
              {items.length === 0
                ? <EmptyState emoji="📊" title={kind === 'expense' ? 'مفيش مصروف في الشهر ده' : 'مفيش دخل في الشهر ده'} />
                : <CategoryBars items={items} currency={currency} />}
            </Card>

            <Card title="آخر 6 شهور" actions={<Legend />}>
              {trend.isLoading && <Skeleton height={200} />}
              {trend.data && <ColumnsChart points={trendPoints(trend.data)} currency={currency} />}
            </Card>
          </div>

          {hasDaily && (
            <Card title="الصرف اليومي" actions={<span className="xsmall muted">متوسط اليوم <span className="num bold">{formatMoney(Math.round(data.totals.expense_minor / Math.max(1, data.period.elapsed_days || data.period.days)), currency)}</span></span>}>
              <ColumnsChart
                series={['expense']}
                currency={currency}
                height={160}
                points={data.daily.map((day) => ({ key: day.date, label: formatDayMonth(day.date), expense_minor: day.expense_minor }))}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
