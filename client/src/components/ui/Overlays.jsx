/** طبقات فوق الصفحة: نافذة حوار، درج جانبي، قائمة منسدلة، وتأكيد الإجراءات */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../lib/icons.jsx';
import { useDismiss, useLatest } from '../../lib/hooks.js';
import { Button } from './Controls.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** النوافذ المفتوحة فوق بعض (تأكيد فوق نموذج مثلًا): Esc وTab للّي فوق بس */
const openModals = [];

/**
 * نافذة حوار: Esc للإغلاق، تحبس التركيز، وتمنع تمرير الخلفية.
 * على الموبايل تظهر كورقة من أسفل الشاشة (CSS).
 * `onClose` يُقرأ من مرجع: الصفحة الأم تمرّر دالة جديدة عند كل رسم، ولو كانت ضمن
 * اعتماديات الأثر لقفز التركيز إلى أول حقل مع كل ضغطة مفتاح.
 * لو فيه نافذة فوق التانية، Esc يقفل اللي فوق بس، والتمرير يرجع لما تتقفل كلها.
 */
export function Modal({ open, onClose, title, children, footer, size = '', dismissible = true }) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useLatest(onClose);

  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    openModals.push(token);
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    (node?.querySelector('[data-autofocus]') ?? node?.querySelector(FOCUSABLE))?.focus();

    const onKey = (event) => {
      if (openModals[openModals.length - 1] !== token) return;
      if (event.key === 'Escape' && dismissible) { event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openModals.splice(openModals.indexOf(token), 1);
      if (openModals.length === 0) document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, dismissible, closeRef]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && dismissible) onClose(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          {dismissible && <Button variant="ghost" size="sm" icon="close" aria-label="إغلاق" onClick={onClose} />}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** درج جانبي (قائمة التنقّل على الشاشات الصغيرة) */
export function Drawer({ open, onClose, children, label = 'القائمة' }) {
  const closeRef = useLatest(onClose);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, closeRef]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>{children}</aside>
    </>,
    document.body,
  );
}

/** قائمة منسدلة: <Menu trigger={زر}> <MenuItem …/> </Menu> */
export function Menu({ trigger, children, label = 'خيارات' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, () => setOpen(false), open);
  return (
    <div className="dropdown" ref={ref}>
      {trigger
        ? <span onClick={() => setOpen((value) => !value)} role="presentation">{trigger}</span>
        : <Button variant="ghost" size="sm" icon="more" aria-label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)} />}
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export const MenuItem = ({ icon, children, danger, ...rest }) => (
  <button type="button" role="menuitem" className={danger ? 'danger' : undefined} {...rest}>
    {icon && <Icon name={icon} size={16} />}{children}
  </button>
);

/* ── التأكيد قبل أي إجراء مدمّر ── */
const ConfirmContext = createContext(null);

/**
 * const confirm = useConfirm();
 * if (await confirm({ title, message, danger, confirmLabel })) …
 */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);

  const confirm = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);
  const close = (answer) => { request?.resolve(answer); setRequest(null); };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(request)}
        onClose={() => close(false)}
        title={request?.title ?? ''}
        size="narrow"
        footer={(
          <>
            <Button onClick={() => close(false)}>{request?.cancelLabel ?? 'رجوع'}</Button>
            <Button variant={request?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {request?.confirmLabel ?? 'تأكيد'}
            </Button>
          </>
        )}
      >
        {request?.message && <p className="muted">{request.message}</p>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm خارج ConfirmProvider');
  return confirm;
};
