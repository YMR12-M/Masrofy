/**
 * هيكل التطبيق بعد الدخول: شريط جانبي (يمين)، شريط علوي، والمحتوى.
 * على الشاشات الصغيرة يختفي الشريط الجانبي في درج، ويظهر زر عائم لإضافة عملية.
 */
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Icon, Logo } from '../../lib/icons.jsx';
import { ROLE_LABELS } from '../../lib/constants.js';
import { useOnline } from '../../lib/hooks.js';
import { Avatar, Button, Drawer, Notice } from '../ui/index.js';
import { QuickAddProvider, useQuickAdd } from '../transactions/QuickAdd.jsx';

/** كل عنصر يظهر لمن يملك صلاحية واحدة على الأقل من perm (أو للكل لو بلا perm) */
const NAV = [
  { to: '/', label: 'الرئيسية', icon: 'home', end: true },
  { to: '/transactions', label: 'العمليات', icon: 'list', perm: ['accounts.read', 'accounts.own'] },
  { to: '/accounts', label: 'الحسابات', icon: 'wallet', perm: ['accounts.read', 'accounts.own'] },
  { to: '/budgets', label: 'الميزانيات', icon: 'target', perm: ['budgets.read'] },
  { to: '/reports', label: 'التقارير', icon: 'chart', perm: ['reports.read'] },
  { section: 'الإعداد' },
  { to: '/categories', label: 'التصنيفات', icon: 'tag', perm: ['categories.manage'] },
  { to: '/members', label: 'الأسرة', icon: 'users' },
  { to: '/audit', label: 'سجل التغييرات', icon: 'shield', perm: ['audit.read'] },
  { to: '/settings', label: 'الإعدادات', icon: 'settings' },
];

function Navigation({ onNavigate }) {
  const { can } = useAuth();
  const allowed = (item) => !item.perm || item.perm.some((permission) => can(permission));
  return (
    <nav className="nav" aria-label="القائمة الرئيسية">
      {NAV.map((item, index) => {
        if (item.section) {
          const hasItems = NAV.slice(index + 1).some((entry) => !entry.section && allowed(entry));
          return hasItems ? <div key={item.section} className="nav-label">{item.section}</div> : null;
        }
        if (!allowed(item)) return null;
        return (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate}>
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  return (
    <>
      <div className="brand">
        <Logo size={38} />
        <div>
          <div className="brand-name">مصروفي</div>
          <small className="truncate" style={{ maxWidth: 170 }}>{user.household.name}</small>
        </div>
      </div>
      <Navigation onNavigate={onNavigate} />
      <div className="sidebar-foot">
        <div className="sidebar-user">
          <Avatar name={user.full_name} />
          <div className="grow">
            <div className="name truncate">{user.full_name}</div>
            <div className="role">{ROLE_LABELS[user.role]}</div>
          </div>
          <Button variant="ghost" size="sm" icon="logout" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج" />
        </div>
      </div>
    </>
  );
}

function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const next = { auto: 'light', light: 'dark', dark: 'auto' }[preference];
  const icon = { auto: 'monitor', light: 'sun', dark: 'moon' }[preference];
  const label = { auto: 'تلقائي', light: 'فاتح', dark: 'داكن' }[preference];
  return (
    <Button variant="ghost" icon={icon} onClick={() => setPreference(next)} title={`المظهر: ${label}`} aria-label={`المظهر: ${label} (اضغط للتبديل)`} />
  );
}

/**
 * زر «عملية جديدة»: في الشريط العلوي على الشاشات الكبيرة، وعائم على الموبايل.
 * العائم يُرسم خارج الشريط العلوي عمدًا: `backdrop-filter` على الشريط يجعل
 * أي عنصر fixed داخله يتموضع بالنسبة له لا للشاشة.
 */
function AddButton({ floating = false }) {
  const { can } = useAuth();
  const openTransaction = useQuickAdd();
  if (!can('transactions.write') && !can('accounts.own')) return null;
  if (floating) {
    return <button type="button" className="fab" onClick={() => openTransaction()} aria-label="عملية جديدة"><Icon name="plus" size={26} /></button>;
  }
  return <Button variant="primary" icon="plus" className="add-btn" onClick={() => openTransaction()}>عملية جديدة</Button>;
}

export default function Shell() {
  const [drawer, setDrawer] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const online = useOnline();

  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <QuickAddProvider>
      <div className="app">
        <aside className="sidebar"><SidebarContent /></aside>
        <Drawer open={drawer} onClose={() => setDrawer(false)}>
          <div className="sidebar" style={{ position: 'static', height: '100%', border: 0 }}>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </Drawer>

        <header className="topbar">
          <Button variant="ghost" icon="menu" className="menu-btn" onClick={() => setDrawer(true)} aria-label="القائمة" />
          <span className="mobile-brand row" style={{ gap: 8 }}><Logo size={30} /><span className="bold">مصروفي</span></span>
          <span className="household"><Icon name="home" size={18} />{user.household.name}</span>
          <span className="grow" />
          <AddButton />
          <ThemeToggle />
        </header>
        <AddButton floating />

        <main className="main" id="main">
          {!online && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <Notice tone="warning" icon="wifi">مفيش اتصال بالإنترنت — اللي هتسجّله دلوقتي مش هيتحفظ لحد ما الاتصال يرجع.</Notice>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </QuickAddProvider>
  );
}
