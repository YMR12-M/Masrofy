/** سجل التغييرات: مين عمل إيه وإمتى — للمراجعة لما حد يسأل «مين مسح العملية دي؟» */
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { formatDateTime, formatMoney } from '../lib/format.js';
import { useDocumentTitle } from '../lib/hooks.js';
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
};

const ENTITIES = [
  ['', 'كل الأنواع'], ['transaction', 'العمليات'], ['account', 'الحسابات'], ['category', 'التصنيفات'],
  ['budget', 'الميزانيات'], ['user', 'الأفراد'], ['household', 'الأسرة'],
];

/** سطر وصف قصير من القيم المحفوظة (اسم الحساب، مبلغ العملية…) */
function describe(entry, currency) {
  const data = entry.after_json ?? entry.before_json;
  if (!data) return null;
  if (entry.entity === 'transaction') return `${TX_TYPE_LABELS[data.type] ?? ''} ${formatMoney(data.amount_minor, currency)} · ${data.occurred_on}`;
  return data.name ?? data.full_name ?? null;
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

  return (
    <div className="page">
      <PageHead title="سجل التغييرات" description="كل تعديل على الفلوس والأفراد، بالاسم والوقت" />
      <div className="filters">
        <Select aria-label="النوع" value={entity} onChange={(event) => { setEntity(event.target.value); setPage(1); }} style={{ maxWidth: 240 }}>
          {ENTITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>
      <Card flush>
        {log.isLoading && <ListSkeleton rows={6} />}
        {log.isError && <ErrorState error={log.error} onRetry={log.refetch} />}
        {log.data?.rows.length === 0 && <EmptyState icon="shield" title="السجل فاضي" />}
        <div className="list">
          {(log.data?.rows ?? []).map((entry) => (
            <div key={entry.id} className="list-item">
              <div className="grow">
                <div className="title">{entry.user_name ?? 'النظام'} <span className="muted" style={{ fontWeight: 400 }}>{ACTIONS[entry.action] ?? entry.action}</span></div>
                {describe(entry, user.household.currency) && <div className="meta truncate">{describe(entry, user.household.currency)}</div>}
              </div>
              <span className="xsmall faint">{formatDateTime(entry.created_at)}</span>
            </div>
          ))}
        </div>
        <Pagination meta={log.data?.meta} onPage={setPage} />
      </Card>
    </div>
  );
}
