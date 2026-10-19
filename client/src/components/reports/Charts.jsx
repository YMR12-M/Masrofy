/**
 * رسوم بسيطة بلا مكتبة: أشرطة أفقية للتصنيفات، وأعمدة SVG للشهور والأيام.
 * الألوان من الرموز (tokens) فتتبع الوضع الداكن تلقائيًّا، وكل رقم له نصّ
 * مقروء بجواره أو في title — الرسم لا يكون المصدر الوحيد للمعلومة.
 */
import { useEffect, useRef, useState } from 'react';
import { formatBps, formatMoney, formatMonthShort } from '../../lib/format.js';

/** حصّة كل تصنيف من الإجمالي */
export function CategoryBars({ items, currency, limit = 8 }) {
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const restTotal = rest.reduce((sum, item) => sum + item.amount_minor, 0);
  const max = Math.max(...shown.map((item) => item.amount_minor), 1);

  return (
    <div className="bars">
      {shown.map((item) => (
        <div key={item.category_id} className="bar-row" style={{ '--cat': item.color }}>
          <span className="row truncate" style={{ gap: 8 }}>
            <span aria-hidden="true">{item.icon ?? '🏷️'}</span>
            <span className="truncate">{item.name}</span>
            <span className="xsmall faint num">{formatBps(item.share_bps)}</span>
          </span>
          <span className="num bold small">{formatMoney(item.amount_minor, currency)}</span>
          <div className="track"><span style={{ width: `${(item.amount_minor / max) * 100}%` }} /></div>
        </div>
      ))}
      {rest.length > 0 && (
        <p className="xsmall muted">+ {rest.length} تصنيفات تانية بإجمالي <span className="num">{formatMoney(restTotal, currency)}</span></p>
      )}
    </div>
  );
}

/** قيمة تقريبية مختصرة لمحور الأرقام: 12500 جنيه ← «12.5 ألف» */
function shortAmount(minor) {
  const pounds = minor / 100;
  if (pounds >= 1_000_000) return `${(pounds / 1_000_000).toFixed(1).replace(/\.0$/, '')} مليون`;
  if (pounds >= 1_000) return `${(pounds / 1_000).toFixed(1).replace(/\.0$/, '')} ألف`;
  return String(Math.round(pounds));
}

/** عرض العنصر الفعلي بالبكسل (يتحدّث مع تغيّر حجم الشاشة) */
function useWidth(fallback = 600) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * أعمدة متجاورة (دخل/مصروف) لكل نقطة.
 * points = [{ key, label, income_minor?, expense_minor }]؛ series يحدّد أيّها يُرسم.
 * الرسم يمتدّ من اليمين لليسار كي يقرأ الزمن بنفس اتجاه النص العربي.
 * مساحة الرسم = عرض الحاوية الفعلي، فلا تنكمش الكتابة في البطاقات الضيّقة.
 */
export function ColumnsChart({ points, series = ['income', 'expense'], currency, height = 200 }) {
  const [ref, width] = useWidth();
  const pad = { top: 12, bottom: 28, side: 44 };
  const innerW = width - pad.side - 8;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...points.flatMap((point) => series.map((name) => point[`${name}_minor`] ?? 0)), 1);
  const slot = innerW / points.length;
  const barW = Math.max(2, Math.min(22, (slot * 0.7) / series.length));
  const y = (value) => pad.top + innerH - (value / max) * innerH;
  // الأقدم يمينًا: النقطة الأولى عند الحافة اليمنى
  const slotX = (index) => 8 + innerW - (index + 1) * slot;
  const labelEvery = Math.ceil(points.length / Math.max(2, Math.floor(innerW / 56)));

  return (
    <div ref={ref}>
      <svg className="columns-chart" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="رسم الدخل والمصروف">
        {[0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line className="grid-line" x1={8} x2={width - pad.side} y1={y(max * ratio)} y2={y(max * ratio)} />
            <text className="tick" x={width - pad.side + 6} y={y(max * ratio) + 4}>{shortAmount(max * ratio)}</text>
          </g>
        ))}
        <line className="axis" x1={8} x2={width - pad.side} y1={pad.top + innerH} y2={pad.top + innerH} />
        {points.map((point, index) => {
          const groupW = barW * series.length + (series.length - 1) * 2;
          const start = slotX(index) + (slot - groupW) / 2;
          return (
            <g key={point.key}>
              {series.map((name, offset) => {
                const value = point[`${name}_minor`] ?? 0;
                return (
                  <rect
                    key={name}
                    className={`bar-${name}`}
                    x={start + (series.length - 1 - offset) * (barW + 2)}
                    y={y(value)}
                    width={barW}
                    height={Math.max(0, pad.top + innerH - y(value))}
                    rx={Math.min(4, barW / 2)}
                  >
                    <title>{`${point.label} — ${name === 'income' ? 'دخل' : 'مصروف'}: ${formatMoney(value, currency)}`}</title>
                  </rect>
                );
              })}
              {/* التخفيف يبدأ من الأحدث كي يظهر اسم الشهر الحالي دائمًا */}
              {(points.length - 1 - index) % labelEvery === 0 && (
                <text className="tick" x={slotX(index) + slot / 2} y={height - 8} textAnchor="middle">{point.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** نقاط الاتجاه الشهري للرسم */
export const trendPoints = (trend) => trend.map((item) => ({
  key: item.month, label: formatMonthShort(item.month), income_minor: item.income_minor, expense_minor: item.expense_minor,
}));

export function Legend({ series = ['income', 'expense'] }) {
  const labels = { income: ['دخل', 'var(--income)'], expense: ['مصروف', 'var(--expense)'] };
  return (
    <div className="legend">
      {series.map((name) => <span key={name}><i style={{ background: labels[name][1] }} />{labels[name][0]}</span>)}
    </div>
  );
}
