/**
 * قائمة «اللي عليّ»: كل معاد مستحقّ بزرار «دفعت» يسجّله بضغطة كعملية حقيقية
 * (بمبلغ الفاتورة وحسابها وتاريخ النهارده). القائمة الكاملة (صفحة الفواتير)
 * تجمّعها: متأخرة · النهارده · الأسبوع ده · بعد كده، ولكل بند قائمة فيها
 * «بمبلغ أو تاريخ تاني» و«تخطّي» (فاتورة) أو «اتدفع قبل كده» (قسط).
 */
import { useState } from 'react';
import { formatDayMonth, formatSigned } from '../../lib/format.js';
import { dueLabel, installmentLabel, postVerb } from '../../lib/bills.js';
import { diffDays } from '../../lib/period.js';
import { Icon } from '../../lib/icons.jsx';
import {
  Badge, Button, CategoryIcon, Menu, MenuItem,
} from '../ui/index.js';
import PostDialog from './PostDialog.jsx';
import { useBillActions } from './useBillActions.js';

const PROBLEMS = { account_archived: 'الحساب مؤرشف', category_archived: 'التصنيف مؤرشف' };

const GROUPS = [
  { id: 'overdue', label: 'متأخرة', test: (days) => days < 0 },
  { id: 'today', label: 'النهارده', test: (days) => days === 0 },
  { id: 'week', label: 'الأسبوع ده', test: (days) => days > 0 && days <= 7 },
  { id: 'later', label: 'بعد كده', test: (days) => days > 7 },
];

export function BillIcon({ item }) {
  if (item.type === 'transfer') {
    return <span className="cat-icon" style={{ '--cat': 'var(--transfer)' }} aria-hidden="true"><Icon name="transfer" size={18} /></span>;
  }
  return <CategoryIcon icon={item.category_icon} color={item.category_color} />;
}

function DueRow({
  item, today, currency, compact, actions, onDetails, onOpenSource,
}) {
  const verb = postVerb(item.type);
  const busy = actions.busy === item.key;
  const account = item.type === 'transfer' ? `${item.account_name} ← ${item.to_account_name}` : item.account_name;

  return (
    <div className={`bill-row ${item.status}`}>
      <BillIcon item={item} />
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="title truncate">{item.name}</span>
        <span className="bill-meta">
          {item.status === 'overdue' && <Badge tone="danger">متأخر</Badge>}
          {item.status === 'today' && <Badge tone="warning">النهارده</Badge>}
          <span>
            {formatDayMonth(item.due_on)}
            {item.status !== 'today' && <> · {dueLabel(item.due_on, today)}</>}
          </span>
          {item.installment && <span>· {installmentLabel(item.installment)}</span>}
          {!compact && <span className="truncate">· {account}</span>}
          {item.auto_post && <Badge tone="primary">تلقائي</Badge>}
          {item.problem && <Badge tone="warning">{PROBLEMS[item.problem]}</Badge>}
        </span>
      </div>
      <span className={`bill-amount num amount-${item.type}`}>{formatSigned(item.amount_minor, item.type, currency)}</span>
      {item.can_post && (
        <div className="bill-actions">
          <Button
            size="sm"
            variant={item.status === 'upcoming' ? 'secondary' : 'primary'}
            icon="check"
            loading={busy}
            disabled={Boolean(actions.busy)}
            onClick={() => actions.post(item)}
            aria-label={`${verb}: ${item.name} ${formatDayMonth(item.due_on)}`}
          >
            {verb}
          </Button>
          {!compact && (
            <Menu label={`خيارات ${item.name}`}>
              <MenuItem icon="edit" onClick={() => onDetails(item)}>بمبلغ أو تاريخ تاني…</MenuItem>
              {item.source === 'recurring' && <MenuItem icon="arrow-left" onClick={() => actions.skip(item)}>تخطّي المرة دي</MenuItem>}
              {item.source === 'installment' && <MenuItem icon="archive" onClick={() => actions.settle(item)}>اتدفع قبل كده</MenuItem>}
              {onOpenSource && (
                <MenuItem icon={item.source === 'recurring' ? 'calendar' : 'card'} onClick={() => onOpenSource(item)}>
                  {item.source === 'recurring' ? 'تعديل الفاتورة' : 'جدول التقسيط'}
                </MenuItem>
              )}
            </Menu>
          )}
        </div>
      )}
      {!item.can_post && !compact && onOpenSource && (
        <div className="bill-actions">
          <Button size="sm" variant="ghost" icon="eye" onClick={() => onOpenSource(item)} aria-label={`تفاصيل ${item.name}`} />
        </div>
      )}
    </div>
  );
}

/**
 * items: بنود /bills/due مرتّبة بالتاريخ.
 * compact: للرئيسية — بلا تجميع ولا قوائم فرعية.
 * onOpenSource(item): يفتح الفاتورة أو خطّة التقسيط.
 */
export default function DueList({
  items, today, currency, compact = false, onOpenSource,
}) {
  const actions = useBillActions();
  const [details, setDetails] = useState(null);

  const row = (item) => (
    <DueRow key={item.key} item={item} today={today} currency={currency} compact={compact} actions={actions} onDetails={setDetails} onOpenSource={onOpenSource} />
  );

  return (
    <>
      {compact ? <div className="list">{items.map(row)}</div> : (
        <div className="list">
          {GROUPS.map((group) => {
            const members = items.filter((item) => group.test(diffDays(today, item.due_on)));
            if (members.length === 0) return null;
            return (
              <div key={group.id} role="group" aria-label={group.label}>
                <div className={`list-group-head ${group.id === 'overdue' ? 'danger' : ''}`}>
                  <span>{group.label}</span>
                  <span className="num">{members.length}</span>
                </div>
                {members.map(row)}
              </div>
            );
          })}
        </div>
      )}
      <PostDialog item={details} onPost={actions.post} onClose={() => setDetails(null)} />
    </>
  );
}
