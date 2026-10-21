/**
 * العمليات: قائمة بفلاتر محفوظة في الرابط (فـ «رجوع» المتصفح والروابط من
 * بطاقة الحساب تعمل)، مجاميع الفترة، تقسيم صفحات، وتصدير CSV بنفس الفلاتر.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, saveBlob } from '../lib/api.js';
import { formatMoney } from '../lib/format.js';
import { useDebounce, useDocumentTitle } from '../lib/hooks.js';
import { currentMonth, periodRange, todayIn } from '../lib/period.js';
import { TX_TYPES } from '../lib/constants.js';
import { categoryTree, useAccounts, useCategories } from '../lib/queries.js';
import TransactionList from '../components/transactions/TransactionList.jsx';
import { useQuickAdd } from '../components/transactions/QuickAdd.jsx';
import {
  Button, Card, EmptyState, ErrorState, ListSkeleton, MonthNav, PageHead, Pagination, SearchInput, Segmented, Select,
} from '../components/ui/index.js';

const PAGE_SIZE = 30;

export default function Transactions() {
  useDocumentTitle('العمليات');
  const { user } = useAuth();
  const toast = useToast();
  const openTransaction = useQuickAdd();
  const { currency, timezone, month_start_day: startDay } = user.household;
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounce(search.trim(), 350);

  const accounts = useAccounts({ includeArchived: true });
  const categories = useCategories();

  const thisMonth = currentMonth(user.household);
  const month = params.get('month') ?? thisMonth;
  const filters = {
    type: params.get('type') ?? '',
    account_id: params.get('account_id') ?? '',
    category_id: params.get('category_id') ?? '',
  };
  const page = Number(params.get('page') ?? 1);

  const update = (changes) => setParams((current) => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    return next;
  }, { replace: true });

  const range = month === 'all' ? {} : periodRange(month, startDay);
  const query = { from: range.from, to: range.to, ...filters, q, page, page_size: PAGE_SIZE };
  const list = useQuery({
    queryKey: ['transactions', query],
    queryFn: () => api.page('/transactions', query),
    placeholderData: keepPreviousData,
  });

  const tree = useMemo(() => {
    const kinds = filters.type === 'income' ? ['income'] : filters.type === 'expense' ? ['expense'] : ['expense', 'income'];
    return kinds.flatMap((kind) => categoryTree(categories.data, kind));
  }, [categories.data, filters.type]);

  async function exportCsv() {
    setExporting(true);
    try {
      const { page: _page, page_size: _size, ...exportQuery } = query;
      saveBlob(await api.download('/transactions/export', exportQuery));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExporting(false);
    }
  }

  const totals = list.data?.meta?.totals;
  const filtered = Boolean(filters.type || filters.account_id || filters.category_id || q);

  return (
    <div className="page">
      <PageHead
        title="العمليات"
        actions={<Button icon="download" onClick={exportCsv} loading={exporting}>تصدير Excel</Button>}
      />

      <div className="toolbar">
        <div className="row wrap">
          {month === 'all'
            ? <Button onClick={() => update({ month: null })} icon="calendar">كل الفترات</Button>
            : <MonthNav month={month} onChange={(value) => update({ month: value === thisMonth ? null : value })} startDay={startDay} />}
          {month !== 'all' && <Button variant="ghost" size="sm" onClick={() => update({ month: 'all' })}>كل الفترات</Button>}
        </div>
        <Segmented
          label="نوع العملية"
          value={filters.type}
          onChange={(type) => update({ type, category_id: null })}
          options={[{ value: '', label: 'الكل' }, ...TX_TYPES.map(({ value, label }) => ({ value, label }))]}
        />
      </div>

      <div className="filters">
        <SearchInput value={search} onChange={(value) => { setSearch(value); update({ q: value.trim() || null }); }} placeholder="ابحث في الجهة أو الملاحظة…" />
        <Select aria-label="الحساب" value={filters.account_id} onChange={(event) => update({ account_id: event.target.value })}>
          <option value="">كل الحسابات</option>
          {(accounts.data ?? []).map((account) => (
            <option key={account.id} value={account.id}>{account.name}{account.archived_at ? ' (مؤرشف)' : ''}</option>
          ))}
        </Select>
        {filters.type !== 'transfer' && (
          <Select aria-label="التصنيف" value={filters.category_id} onChange={(event) => update({ category_id: event.target.value })}>
            <option value="">كل التصنيفات</option>
            {tree.map((parent) => (
              <optgroup key={parent.id} label={`${parent.icon ?? ''} ${parent.name}`}>
                <option value={parent.id}>{parent.name}{parent.children.length ? ' (كله)' : ''}</option>
                {parent.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
              </optgroup>
            ))}
          </Select>
        )}
      </div>

      {totals && (
        <div className="totals-line" aria-live="polite">
          <span><span className="num">{list.data.meta.total}</span> عملية</span>
          {totals.income_minor > 0 && <span>دخل <span className="num amount-income bold">{formatMoney(totals.income_minor, currency)}</span></span>}
          {totals.expense_minor > 0 && <span>مصروف <span className="num amount-expense bold">{formatMoney(totals.expense_minor, currency)}</span></span>}
        </div>
      )}

      <Card flush>
        {list.isLoading && <ListSkeleton rows={6} />}
        {list.isError && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.data?.rows.length === 0 && (
          filtered
            ? <EmptyState icon="search" title="مفيش نتائج" description="جرّب تشيل فلتر أو تغيّر الشهر." />
            : <EmptyState icon="receipt" title="مفيش عمليات في الفترة دي" action={<Button variant="primary" icon="plus" onClick={() => openTransaction()}>سجّل عملية</Button>} />
        )}
        {list.data?.rows.length > 0 && (
          <>
            <TransactionList rows={list.data.rows} today={todayIn(timezone)} currency={currency} />
            <Pagination meta={list.data.meta} onPage={(next) => { update({ page: next }); window.scrollTo({ top: 0 }); }} />
          </>
        )}
      </Card>
    </div>
  );
}
