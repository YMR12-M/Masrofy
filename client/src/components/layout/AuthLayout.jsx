/**
 * إطار شاشات الدخول والتسجيل: لوحة العلامة (زينة فقط، aria-hidden) والاستمارة.
 * اللوحة ورقة بنكنوت: حبر أخضر منقوش، الاسم بالرقعة، ووردة جيلوش في الركن.
 * العنوان الحقيقي h1 داخل الاستمارة.
 */
import { Icon, Logo } from '../../lib/icons.jsx';
import { Rosette } from '../ui/Plate.jsx';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-screen">
      <section className="auth-panel" aria-hidden="true">
        <Rosette timeBps={10_000} spendBps={10_000} />
        <div className="row" style={{ gap: 14 }}>
          <Logo size={48} />
          <span className="wordmark">مصروفي</span>
        </div>
        <div>
          <p className="tagline">كل جنيه في البيت <span>عارف راح فين</span>.</p>
          <ul>
            <li><Icon name="wallet" size={20} />الكاش والبنك والمحافظ في مكان واحد</li>
            <li><Icon name="target" size={20} />ميزانية لكل بند وتنبيه قبل ما تعدّي</li>
            <li><Icon name="users" size={20} />الأسرة كلها تسجّل، وكل واحد له جيبه الخاص</li>
          </ul>
        </div>
        <small>مصروفي، لمصاريف البيت والأسرة</small>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-card stack lg">
          <div className="auth-brand">
            <Logo size={40} />
            <span className="wordmark">مصروفي</span>
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
