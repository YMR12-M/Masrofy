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
import { Icon } from '../lib/icons.jsx';
import {
  Card, EmptyState, ErrorState, MoneyFigure, MonthNav, PageHead, Plate, Segmented, Skeleton,
} from '../components/ui/index.js';

/**
 * «12% أكتر من الشهر اللي فات» — للمصروف الزيادة سيّئة وللدخل جيّدة.
 * الاتجاه بالسهم والكلمة، مش باللون بس.
 */
function change(current, previous, goodWhenUp) {
  if (!previous) return null;
  const bps = Math.round(((current - previous) * 10_000) / previous);
  if (bps === 0) return <span className="change">زي الشهر اللي فات</span>;
  const up = bps > 0;
  const good = up === goodWhenUp;
  return (
    <span className="change" style={{ color: good ? 'var(--income-on-ink)' : 'var(--expense-on-ink)' }}>
      <Icon name={up ? 'arrow-up' : 'arrow-down'} size={14} />
      <span className="num">{formatBps(Math.abs(bps))}</span> {up ? 'أكتر' : 'أقل'} من الشهر اللي فات
    </span>
  );
}

/** لوحة الصفحة: صافي الشهر، والدخل والمصروف مع المقارنة، ونسبة الادخار */
function MonthTotals({ data, currency }) {
  const { totals, previous } = data;
  return (
    <Plate aria-label="أرقام الشهر">
      <span className="plate-label">صافي الشهر</span>
      <MoneyFigure className={`plate-figure ${totals.net_minor < 0 ? 'negative' : ''}`} minor={totals.net_minor} currency={currency} compact />
      <div className="plate-stats">
        <div>
          <span className="plate-label"><Icon name="arrow-down" size={16} /> الدخل</span>
          <b className="num">{formatMoney(totals.income_minor, currency)}</b>
          {change(totals.income_minor, previous.income_minor, true)}
        </div>
        <div>
          <span className="plate-label"><Icon name="arrow-up" size={16} /> المصروف</span>
          <b className="num">{formatMoney(totals.expense_minor, currency)}</b>
          {change(totals.expense_minor, previous.expense_minor, false)}
        </div>
        <div>
          <span className="plate-label"><Icon name="safe" size={16} /> نسبة الادخار</span>
          <b className="num">{totals.savings_rate_bps === null ? 'مفيش دخل' : formatBps(totals.savings_rate_bps)}</b>
          <span className="change">من دخل الشهر</span>
        </div>
      </div>
    </Plate>
  );
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

      {summary.isError && <Card><ErrorState error={summary.error} onRetry={summary.refetch} /></Card>}
      {summary.isLoading && <Skeleton height={210} style={{ borderRadius: 20 }} />}

      {data && (
        <>
          <MonthTotals data={data} currency={currency} />

          <div className="grid cols-2">
            <Card
              title={kind === 'expense' ? 'المصروف حسب التصنيف' : 'الدخل حسب المصدر'}
              actions={<Segmented label="النوع" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'مصروف' }, { value: 'income', label: 'دخل' }]} />}
            >
              {items.length === 0
                ? <EmptyState icon="chart" title={kind === 'expense' ? 'مفيش مصروف في الشهر ده' : 'مفيش دخل في الشهر ده'} />
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
