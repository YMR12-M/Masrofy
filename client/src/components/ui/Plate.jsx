/**
 * عناصر «البنكنوت»: اللوحة الخضرا (رقم الصفحة الأهم، واحدة بس في كل شاشة)،
 * المبلغ بشكل فئة الورقة، والوردة: نقش جيلوش مرسوم من أرقام الشهر نفسها.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { moneyParts } from '../../lib/format.js';
import { ACCOUNT_TYPE } from '../../lib/constants.js';
import { Icon } from '../../lib/icons.jsx';

/**
 * خطوط الجيلوش: دواير متموّجة متداخلة (r = R + a·sin(kθ + φ)) زي نقش الورقة.
 * بترجع path لكل خط، من أعلى الدايرة ومع عقارب الساعة، لحد نسبة `to` من اللفّة.
 * الإحداثيات في مربّع 200×200 ومركزه (100، 100).
 */
function guilloche({ radius, amp, lobes, lines, to = 1, step = Math.PI / 180 }) {
  const span = Math.max(0, Math.min(1, to)) * 2 * Math.PI;
  if (span === 0) return [];
  const count = Math.max(2, Math.ceil(span / step));
  const start = -Math.PI / 2;
  return Array.from({ length: lines }, (_, line) => {
    const phase = (line / lines) * 2 * Math.PI;
    let d = '';
    for (let index = 0; index <= count; index += 1) {
      const angle = start + (span * index) / count;
      const r = radius + amp * Math.sin(lobes * angle + phase);
      d += `${index ? 'L' : 'M'}${(100 + r * Math.cos(angle)).toFixed(2)} ${(100 + r * Math.sin(angle)).toFixed(2)}`;
    }
    return d;
  });
}

const TIME_BAND = { radius: 84, amp: 5, lobes: 36, lines: 6 };
const SPEND_BAND = { radius: 60, amp: 7, lobes: 24, lines: 8, step: Math.PI / 120 };
const TIME_BASE = guilloche(TIME_BAND).join('');
const SPEND_BASE = guilloche(SPEND_BAND).join('');

/**
 * الوردة: الحلقة البرّانية البيضا = اللي عدّى من أيام الشهر، والجوّانية الدهب =
 * اللي اتصرف من الدخل. لو الدهب سبق الأبيض يبقى الصرف أسرع من الشهر.
 * timeBps / spendBps بالـ basis points؛ spendBps = null لو مفيش دخل.
 */
export function Rosette({ timeBps, spendBps, label, children, className = '' }) {
  const time = useMemo(() => guilloche({ ...TIME_BAND, to: timeBps / 10_000 }), [timeBps]);
  const spend = useMemo(() => (spendBps === null ? [] : guilloche({ ...SPEND_BAND, to: spendBps / 10_000 })), [spendBps]);
  const over = spendBps !== null && spendBps > 10_000;

  const todayAngle = -Math.PI / 2 + (Math.min(timeBps, 10_000) / 10_000) * 2 * Math.PI;
  const tick = (r) => `${(100 + r * Math.cos(todayAngle)).toFixed(2)} ${(100 + r * Math.sin(todayAngle)).toFixed(2)}`;

  return (
    <div className={`rosette ${over ? 'over' : ''} ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <path className="time-base" d={TIME_BASE} />
        <path className="spend-base" d={SPEND_BASE} />
        {time.map((d, index) => <path key={`t${index}`} className="time-done done-line" d={d} pathLength="1" />)}
        {spend.map((d, index) => <path key={`s${index}`} className="spend-done done-line" d={d} pathLength="1" />)}
        {timeBps > 0 && timeBps < 10_000 && <path className="today" d={`M${tick(76)}L${tick(94)}`} />}
      </svg>
      {children && <div className="rosette-center">{children}</div>}
    </div>
  );
}

/** اللوحة: المحتوى في ناحية، وخيط الأمان، والوردة (أو أي حاجة) في الناحية التانية */
export function Plate({ children, aside, className = '', ...rest }) {
  return (
    <section className={`plate ${className}`} {...rest}>
      <div className="plate-body">{children}</div>
      {aside && <span className="plate-thread" aria-hidden="true" />}
      {aside && <div className="plate-aside">{aside}</div>}
    </section>
  );
}

/** المبلغ بشكل فئة الورقة: «1,250» كبير و«.50» و«ج.م.» صغيرين */
export function MoneyFigure({ minor, currency = 'EGP', compact = false, size = 'xl', className = '' }) {
  const { sign, whole, fraction, symbol } = moneyParts(minor, currency, { compact });
  return (
    <span className={`figure ${size} ${className}`}>
      <span className="amount">{sign}{whole}{fraction && <span className="frac">{fraction}</span>}</span>
      <span className="cur">{symbol}</span>
    </span>
  );
}

/** علامة الحساب الثابتة: لونه وأيقونة نوعه — نفس الشكل في الرئيسية والحسابات وأي مكان */
export function AccountMark({ account, size = '' }) {
  return (
    <span className={`acc-mark ${size}`} style={{ '--acc': account.color || undefined }} aria-hidden="true">
      <Icon name={ACCOUNT_TYPE[account.type]?.icon ?? 'wallet'} size={size === 'sm' ? 16 : 20} />
    </span>
  );
}

/** رابط «الكل» في رأس البطاقة */
export function CardLink({ to, children = 'الكل' }) {
  return <Link to={to} className="card-link">{children}<Icon name="chevron-left" size={16} /></Link>;
}

const EMBLEM_RING = guilloche({ radius: 84, amp: 6, lobes: 20, lines: 3 }).join('');

/** حلقة منقوشة صغيرة حوالين أيقونة الحالة الفاضية */
export function Emblem({ icon, tone = '' }) {
  return (
    <span className={`empty-emblem ${tone}`} aria-hidden="true">
      <svg className="ring" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="2.4"><path d={EMBLEM_RING} /></svg>
      <Icon name={icon} size={28} />
    </span>
  );
}
