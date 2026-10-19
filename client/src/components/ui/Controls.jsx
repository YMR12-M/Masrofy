/**
 * عناصر الإدخال: زر، حقل، قائمة، مفتاح، مبلغ، اختيار إيموجي ولون…
 * كل حقل داخل <Field> يأخذ `error` (نصّ) فيعرضه تحته ويضبط aria-invalid.
 */
import { forwardRef, useEffect, useId, useState } from 'react';
import { currencySymbol, inputToMinor, minorToInput } from '../../lib/format.js';
import { Icon } from '../../lib/icons.jsx';
import { COLORS, EMOJIS } from '../../lib/constants.js';

export const Button = forwardRef(function Button(
  { variant = 'secondary', size, icon, loading = false, block = false, children, className = '', type = 'button', ...rest },
  ref,
) {
  const classes = ['btn', variant, size, block && 'block', icon && !children && 'icon', className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={rest.disabled || loading} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
});

/**
 * غلاف حقل: تسمية + تلميح + خطأ، ويربط htmlFor تلقائيًّا.
 * الأبناء دالة تستلم { id, aria-invalid, aria-describedby } لتمريرها للعنصر.
 */
export function Field({ label, hint, error, required, children, className = '' }) {
  const id = useId();
  const control = typeof children === 'function'
    ? children({ id, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': error ? `${id}-err` : undefined })
    : children;
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>}
      {control}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

export const Input = forwardRef(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`input ${className}`} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`textarea ${className}`} {...rest} />;
});

export const Select = forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return <select ref={ref} className={`select ${className}`} {...rest}>{children}</select>;
});

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className="row start" style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span />
      </span>
      <span className="stack sm" style={{ gap: 0 }}>
        <span>{label}</span>
        {hint && <span className="xsmall faint">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * حقل مبلغ: يعرض بالجنيه ويُرجع قروشًا صحيحة (أو null لو فارغ/غير صالح).
 * يحتفظ بنصّه أثناء الكتابة كي لا يمسح «12.» قبل أن تكمل «12.5».
 * `currency` كود العملة (EGP) ويظهر رمزها بالعربي بجوار الحقل.
 */
export const MoneyInput = forwardRef(function MoneyInput(
  { value, onChange, currency = 'EGP', allowNegative = false, large = false, ...rest },
  ref,
) {
  const [text, setText] = useState(minorToInput(value));
  useEffect(() => {
    if (inputToMinor(text, { allowNegative }) !== (value ?? null)) setText(minorToInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- نزامن فقط عند تغيّر القيمة من الخارج
  }, [value]);

  return (
    <div className={`input-group ${large ? 'amount-input' : ''}`}>
      <input
        ref={ref}
        className="input ltr-input num"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={text}
        onChange={(event) => { setText(event.target.value); onChange(inputToMinor(event.target.value, { allowNegative })); }}
        {...rest}
      />
      <span className="addon">{currencySymbol(currency)}</span>
    </div>
  );
});

export function SearchInput({ value, onChange, placeholder = 'بحث…', ...rest }) {
  return (
    <div className="search-input">
      <Icon name="search" size={18} />
      <input className="input" type="search" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} {...rest} />
    </div>
  );
}

/** أزرار مجمّعة: options = [{ value, label, icon?, tone? }] */
export function Segmented({ value, onChange, options, label, block = false }) {
  return (
    <div className={`segmented ${block ? 'block' : ''}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.tone ? `tone-${option.tone}` : undefined}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={16} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({ value, onChange }) {
  return (
    <div className="picker-grid" role="group" aria-label="أيقونة">
      {EMOJIS.map((emoji) => (
        <button key={emoji} type="button" aria-pressed={value === emoji} aria-label={emoji} onClick={() => onChange(value === emoji ? null : emoji)}>
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }) {
  return (
    <div className="swatches" role="group" aria-label="اللون">
      {COLORS.map((color) => (
        <button key={color} type="button" aria-pressed={value === color} aria-label={color} style={{ background: color }} onClick={() => onChange(color)} />
      ))}
    </div>
  );
}
