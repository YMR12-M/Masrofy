/** عناصر العرض: بطاقة، رأس صفحة، شارة، مبلغ، حالات التحميل والفراغ والخطأ… */
import { formatMoney, formatMonth, formatDayMonth } from '../../lib/format.js';
import { addMonths, periodRange } from '../../lib/period.js';
import { Icon } from '../../lib/icons.jsx';

export function Card({ title, actions, children, flush = false, className = '', footer }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  );
}

export function PageHead({ title, description, actions }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export const Badge = ({ tone = '', children, className = '' }) => <span className={`badge ${tone} ${className}`}>{children}</span>;

/** مبلغ بالقروش؛ `tone` يلوّنه (income / expense / auto: السالب أحمر) */
export function Money({ minor, currency = 'EGP', tone, compact = false, className = '' }) {
  const toneClass = tone === 'auto' ? (minor < 0 ? 'amount-negative' : '') : tone ? `amount-${tone}` : '';
  return <span className={`num ${toneClass} ${className}`}>{formatMoney(minor, currency, { compact })}</span>;
}

export function Loading({ label = 'جارٍ التحميل…' }) {
  return (
    <div className="loading" role="status">
      <div className="stack" style={{ alignItems: 'center' }}>
        <span className="spinner" style={{ width: 28, height: 28 }} />
        <span className="muted small">{label}</span>
      </div>
    </div>
  );
}

export const Skeleton = ({ height = 16, width = '100%', style }) =>
  <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />;

/** قائمة هيكلية أثناء التحميل */
export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="list-item">
          <Skeleton width={40} height={40} style={{ borderRadius: 12 }} />
          <div className="grow stack sm"><Skeleton width="45%" /><Skeleton width="25%" height={12} /></div>
          <Skeleton width={80} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ emoji = '🗂️', title, description, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{emoji}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function Notice({ tone = '', icon = 'info', children, action }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'danger' ? 'alert' : 'note'}>
      <Icon name={icon} size={18} />
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="alert" size={28} /></div>
      <h3>تعذّر تحميل البيانات</h3>
      <p>{error?.message ?? 'حصل خطأ غير متوقّع'}</p>
      {onRetry && <button type="button" className="btn secondary" onClick={onRetry}>حاول تاني</button>}
    </div>
  );
}

export function Stat({ label, minor, currency, tone, sub, icon }) {
  return (
    <div className="card stat">
      <span className="label row" style={{ gap: 6 }}>{icon && <Icon name={icon} size={16} />}{label}</span>
      <span className="value"><Money minor={minor} currency={currency} tone={tone} /></span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function Avatar({ name, size = 36 }) {
  const letter = (name ?? '').trim()[0] ?? '؟';
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">{letter}</span>;
}

/** أيقونة التصنيف: الإيموجي على خلفية بلون التصنيف */
export function CategoryIcon({ icon, color, size = '' }) {
  return <span className={`cat-icon ${size}`} style={{ '--cat': color }} aria-hidden="true">{icon ?? '🏷️'}</span>;
}

export function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" className="tab" aria-selected={value === item.id} onClick={() => onChange(item.id)}>
          {item.label}
          {item.count !== undefined && <span className="count num">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div className="pagination">
      <span>صفحة <span className="num">{meta.page}</span> من <span className="num">{meta.total_pages}</span></span>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn secondary sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          <Icon name="chevron-right" size={16} /> السابق
        </button>
        <button type="button" className="btn secondary sm" disabled={meta.page >= meta.total_pages} onClick={() => onPage(meta.page + 1)}>
          التالي <Icon name="chevron-left" size={16} />
        </button>
      </div>
    </div>
  );
}

/** شريط تقدّم بحالة (ok / warning / over) وعلامة اختيارية (حدّ التنبيه أو مرور الوقت) */
export function Progress({ valueBps, status = '', markerBps, label }) {
  const width = Math.min(100, Math.max(0, valueBps / 100));
  return (
    <div className={`progress ${status}`} role="progressbar" aria-valuenow={Math.round(valueBps / 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${width}%` }} />
      {markerBps !== undefined && markerBps > 0 && markerBps < 10_000 && <i className="marker" style={{ insetInlineStart: `${markerBps / 100}%` }} />}
    </div>
  );
}

/**
 * متنقّل الشهور المالية: ‹ أكتوبر 2026 ›
 * لو الشهر المالي لا يبدأ يوم 1 نعرض حدوده تحته كي لا يلتبس.
 */
export function MonthNav({ month, onChange, startDay = 1, max }) {
  const range = periodRange(month, startDay);
  return (
    <div className="month-nav">
      <button type="button" className="btn ghost icon sm" aria-label="الشهر السابق" onClick={() => onChange(addMonths(month, -1))}>
        <Icon name="chevron-right" size={18} />
      </button>
      <span className="label">
        {formatMonth(month)}
        {startDay !== 1 && <span className="range">{formatDayMonth(range.from)} – {formatDayMonth(range.to)}</span>}
      </span>
      <button type="button" className="btn ghost icon sm" aria-label="الشهر التالي" disabled={Boolean(max) && month >= max} onClick={() => onChange(addMonths(month, 1))}>
        <Icon name="chevron-left" size={18} />
      </button>
    </div>
  );
}
