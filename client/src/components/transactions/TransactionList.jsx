/**
 * قائمة العمليات مجمّعة بالأيام: عنوان لكل يوم (النهارده، امبارح…) وصافيه،
 * وصفّ لكل عملية يفتح نموذج التعديل.
 */
import { formatDayHeading, formatMoney, formatSigned } from '../../lib/format.js';
import { Icon } from '../../lib/icons.jsx';
import { CategoryIcon } from '../ui/index.js';
import { useQuickAdd } from './QuickAdd.jsx';

function TransactionRow({ row, currency }) {
  const openTransaction = useQuickAdd();
  const isTransfer = row.type === 'transfer';
  const category = row.parent_category_name ? `${row.parent_category_name} › ${row.category_name}` : row.category_name;
  const title = row.payee || (isTransfer ? 'تحويل' : row.category_name);

  return (
    <button type="button" className="list-item" onClick={() => openTransaction({ transaction: row })}>
      {isTransfer ? (
        <span className="cat-icon" style={{ '--cat': 'var(--transfer)' }} aria-hidden="true"><Icon name="transfer" size={18} /></span>
      ) : (
        <CategoryIcon icon={row.category_icon ?? row.parent_category_icon} color={row.category_color} />
      )}
      <span className="grow stack sm" style={{ gap: 2 }}>
        <span className="title truncate">{title}</span>
        <span className="meta tx-sub">
          {isTransfer
            ? <span className="truncate">{row.account_name} ← {row.to_account_name}</span>
            : <span className="truncate">{row.payee ? `${category} · ` : ''}{row.account_name}</span>}
          {row.note && <span className="truncate" title={row.note}>· {row.note}</span>}
        </span>
      </span>
      <span className={`tx-amount num amount-${row.type}`}>{formatSigned(row.amount_minor, row.type, currency)}</span>
    </button>
  );
}

/** صافي اليوم (الدخل − المصروف؛ التحويلات خارجها) */
const dayNet = (rows) => rows.reduce((total, row) => {
  if (row.type === 'income') return total + row.amount_minor;
  if (row.type === 'expense') return total - row.amount_minor;
  return total;
}, 0);

export default function TransactionList({ rows, today, currency, grouped = true }) {
  if (!grouped) {
    return <div className="list">{rows.map((row) => <TransactionRow key={row.id} row={row} currency={currency} />)}</div>;
  }

  const days = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last?.date === row.occurred_on) last.rows.push(row);
    else days.push({ date: row.occurred_on, rows: [row] });
  }

  return (
    <div className="list">
      {days.map((group) => {
        const net = dayNet(group.rows);
        return (
          <div key={group.date} role="group" aria-label={formatDayHeading(group.date, today)}>
            <div className="list-group-head">
              <span>{formatDayHeading(group.date, today)}</span>
              {net !== 0 && <span className={`num ${net < 0 ? 'amount-expense' : 'amount-income'}`}>{formatMoney(net, currency)}</span>}
            </div>
            {group.rows.map((row) => <TransactionRow key={row.id} row={row} currency={currency} />)}
          </div>
        );
      })}
    </div>
  );
}
