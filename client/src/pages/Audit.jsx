/** سجل التغييرات: مين عمل إيه وإمتى، للمراجعة لما حد يسأل «مين مسح العملية دي؟» */
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { formatDayHeading, formatDayMonth, formatMoney } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { Icon } from '../lib/icons.jsx';
import { TX_TYPE_LABELS } from '../lib/constants.js';
import {
  Card, EmptyState, ErrorState, ListSkeleton, PageHead, Pagination, Select,
} from '../components/ui/index.js';

const ACTIONS = {
  'auth.register': 'فتح حساب الأسرة',
  'auth.login': 'سجّل دخول',
  'auth.password_changed': 'غيّر كلمة المرور',
  'household.update': 'عدّل إعدادات الأسرة',
  'member.create': 'ضاف فرد',
  'member.update': 'عدّل بيانات فرد',
  'member.delete': 'حذف فرد',
  'member.temp_password': 'أصدر كلمة مؤقتة',
  'account.create': 'ضاف حساب',
  'account.update': 'عدّل حساب',
  'account.archive': 'أرشف حساب',
  'account.delete': 'حذف حساب',
  'category.create': 'ضاف تصنيف',
  'category.update': 'عدّل تصنيف',
  'category.archive': 'أرشف تصنيف',
  'category.delete': 'حذف تصنيف',
  'transaction.create': 'سجّل عملية',
  'transaction.update': 'عدّل عملية',
  'transaction.delete': 'حذف عملية',
  'budget.create': 'ضاف ميزانية',
  'budget.update': 'عدّل ميزانية',
  'budget.delete': 'حذف ميزانية',
  'recurring.create': 'ضاف فاتورة متكرّرة',
  'recurring.update': 'عدّل فاتورة متكرّرة',
  'recurring.delete': 'حذف فاتورة متكرّرة',
  'recurring.post': 'سجّل فاتورة',
  'recurring.skip': 'تخطّى معاد فاتورة',
  'installment.create': 'ضاف تقسيط',
  'installment.update': 'عدّل تقسيط',
  'installment.delete': 'حذف تقسيط',
  'installment.pay': 'دفع قسط',
  'installment.settle': 'علّم قسط مدفوع',
  'installment.unsettle': 'شال علامة قسط مدفوع',
};

/** النوع: اسمه في الفلتر وأيقونته في الصفّ (نفس أيقونات القائمة الجانبية) */
const ENTITIES = [
  ['transaction', 'العمليات', 'list'], ['account', 'الحسابات', 'wallet'], ['category', 'التصنيفات', 'tag'],
  ['budget', 'الميزانيات', 'target'], ['recurring_rule', 'الفواتير المتكرّرة', 'repeat'], ['installment_plan', 'التقسيط', 'card'],
  ['user', 'الأفراد', 'users'], ['household', 'الأسرة', 'home'],
];
const ENTITY_ICON = Object.fromEntries(ENTITIES.map(([value, , icon]) => [value, icon]));

/** يوم اللحظة بتوقيت الجهاز (YYYY-MM-DD)، زي ما الوقت نفسه بيتعرض */
const dayKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' });

/** سطر وصف قصير من القيم المحفوظة (اسم الحساب، مبلغ العملية…)، أجزاء بينها « · » */
function describe(entry, currency) {
  const data = entry.after_json ?? entry.before_json;
  if (!data) return null;
  const money = (minor) => <span className="num">{formatMoney(minor, currency)}</span>;
  let parts;
  if (entry.entity === 'transaction') parts = [<>{TX_TYPE_LABELS[data.type] ?? ''} {money(data.amount_minor)}</>, formatDayMonth(data.occurred_on)];
  // تسجيل معاد فاتورة أو قسط: الاسم + المعاد
  else if (data.due_on && data.name) parts = [data.name, formatDayMonth(data.due_on), data.amount_minor ? money(data.amount_minor) : null];
  else parts = [data.name ?? data.full_name];
  parts = parts.filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map((part, index) => <span key={index}>{index > 0 && ' · '}{part}</span>);
}

function groupByDay(rows) {
  const days = [];
  for (const entry of rows) {
    const date = dayKey.format(new Date(entry.created_at));
    const last = days[days.length - 1];
    if (last?.date === date) last.rows.push(entry);
    else days.push({ date, rows: [entry] });
  }
  return days;
}

export default function Audit() {
  useDocumentTitle('سجل التغييرات');
  const { user } = useAuth();
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const log = useQuery({
    queryKey: ['audit', entity, page],
    queryFn: () => api.page('/audit', { entity, page, page_size: 30 }),
    placeholderData: keepPreviousData,
  });
  const rows = log.data?.rows ?? [];
  const today = dayKey.format(new Date());
  const currency = user.household.currency;

  return (
    <div className="page">
      <PageHead
        title="سجل التغييرات"
        description="كل تعديل على الفلوس والأفراد، بالاسم والوقت"
        actions={(
          <Select aria-label="نوع التغيير" value={entity} onChange={(event) => { setEntity(event.target.value); setPage(1); }} style={{ minWidth: 200 }}>
            <option value="">كل الأنواع</option>
            {ENTITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        )}
      />
      <Card flush>
        {log.isLoading && <ListSkeleton rows={6} />}
        {log.isError && <ErrorState error={log.error} onRetry={log.refetch} />}
        {log.isSuccess && rows.length === 0 && (
          <EmptyState
            icon="shield"
            title={entity ? 'مفيش تغييرات من النوع ده' : 'السجل فاضي'}
            description={entity ? 'جرّب نوع تاني أو اختار «كل الأنواع».' : 'أي إضافة أو تعديل أو حذف هيظهر هنا باسم اللي عمله.'}
          />
        )}
        <div className={`list ${log.isPlaceholderData ? 'is-fetching' : ''}`} aria-busy={log.isFetching || undefined}>
          {groupByDay(rows).map((group) => (
            <div key={group.date} role="group" aria-label={formatDayHeading(group.date, today)}>
              <div className="list-group-head"><span>{formatDayHeading(group.date, today)}</span></div>
              {group.rows.map((entry) => {
                const detail = describe(entry, currency);
                return (
                  <div key={entry.id} className="list-item">
                    <span className="cat-icon sm" style={{ '--cat': 'var(--text-muted)' }} aria-hidden="true">
                      <Icon name={ENTITY_ICON[entry.entity] ?? (entry.action.startsWith('auth.') ? 'key' : 'info')} size={16} />
                    </span>
                    <div className="grow">
                      <div className="truncate">
                        <span className="title">{entry.user_name ?? 'النظام'}</span>
                        {' '}<span className="muted">{ACTIONS[entry.action] ?? entry.action}</span>
                      </div>
                      {detail && <div className="meta truncate">{detail}</div>}
                    </div>
                    <span className="xsmall faint num">{timeFormat.format(new Date(entry.created_at))}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <Pagination meta={log.data?.meta} onPage={(next) => { setPage(next); window.scrollTo({ top: 0 }); }} />
      </Card>
    </div>
  );
}
