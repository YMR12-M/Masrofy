/**
 * إطار شاشات الدخول والتسجيل: لوحة العلامة (زينة فقط، aria-hidden) والاستمارة.
 * العنوان الحقيقي h1 داخل الاستمارة.
 */
import { Icon, Logo } from '../../lib/icons.jsx';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-screen">
      <section className="auth-panel" aria-hidden="true">
        <div className="ledger-lines" />
        <div className="row" style={{ gap: 12, position: 'relative' }}>
          <Logo size={44} />
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>مصروفي</span>
        </div>
        <div style={{ position: 'relative' }}>
          <p className="tagline">كل جنيه في البيت <span>عارف راح فين</span>.</p>
          <ul>
            <li><Icon name="wallet" size={18} />الكاش والبنك والمحافظ في مكان واحد</li>
            <li><Icon name="target" size={18} />ميزانية لكل بند وتنبيه قبل ما تعدّي</li>
            <li><Icon name="users" size={18} />الأسرة كلها تسجّل، وكل واحد له جيبه الخاص</li>
          </ul>
        </div>
        <small style={{ position: 'relative', opacity: 0.75 }}>© مصروفي</small>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-card stack lg">
          <div className="auth-brand">
            <Logo size={40} />
            <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>مصروفي</span>
          </div>
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="muted" style={{ marginTop: 4 }}>{subtitle}</p>}
          </div>
          {children}
          {footer}
        </div>
      </section>
    </div>
  );
}
