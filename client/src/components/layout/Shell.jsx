/**
 * هيكل التطبيق بعد الدخول: الشريط الأخضر (يمين)، الشريط العلوي، والمحتوى.
 * على الموبايل الشريط الجانبي بيستخبى ويظهر شريط سفلي بأهم الصفحات، وفي نصّه
 * زرار العملة الدهب لعملية جديدة، و«المزيد» بيفتح القائمة كاملة في درج.
 * على الكمبيوتر حرف N (أو «ى» على الكيبورد العربي) بيفتح عملية جديدة من أي صفحة.
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Icon, Logo } from '../../lib/icons.jsx';
import { ROLE_LABELS } from '../../lib/constants.js';
import { useOnline } from '../../lib/hooks.js';
import { Avatar, Button, Drawer, Notice } from '../ui/index.js';
import { QuickAddProvider, useQuickAdd } from '../transactions/QuickAdd.jsx';

const MONEY = ['accounts.read', 'accounts.own'];

/** كل عنصر يظهر لمن يملك صلاحية واحدة على الأقل من perm (أو للكل لو بلا perm) */
const NAV = [
  { to: '/', label: 'الرئيسية', icon: 'home', end: true },
  { to: '/transactions', label: 'العمليات', icon: 'list', perm: MONEY },
  { to: '/accounts', label: 'الحسابات', icon: 'wallet', perm: MONEY },
  { to: '/budgets', label: 'الميزانيات', icon: 'target', perm: ['budgets.read'] },
  { to: '/reports', label: 'التقارير', icon: 'chart', perm: ['reports.read'] },
  { section: 'الإعداد' },
  { to: '/categories', label: 'التصنيفات', icon: 'tag', perm: ['categories.manage'] },
  { to: '/members', label: 'الأسرة', icon: 'users' },
  { to: '/audit', label: 'سجل التغييرات', icon: 'shield', perm: ['audit.read'] },
  { to: '/settings', label: 'الإعدادات', icon: 'settings' },
];

/** الشريط السفلي على الموبايل: أربع وجهات وزرار الإضافة في النص */
const TABS = [
  { to: '/', label: 'الرئيسية', icon: 'home', end: true },
  { to: '/transactions', label: 'العمليات', icon: 'list', perm: MONEY },
  { add: true },
  { to: '/accounts', label: 'الحسابات', icon: 'wallet', perm: MONEY },
  { more: true },
];

const useAllowed = () => {
  const { can } = useAuth();
  return (item) => !item.perm || item.perm.some((permission) => can(permission));
};

const useCanRecord = () => {
  const { can } = useAuth();
  return can('transactions.write') || can('accounts.own');
};

function Navigation({ onNavigate }) {
  const allowed = useAllowed();
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
      <Link to="/" className="brand" onClick={onNavigate} aria-label="مصروفي: الرئيسية">
        <Logo size={40} />
        <div style={{ minWidth: 0 }}>
          <div className="wordmark">مصروفي</div>
          <small className="truncate">{user.household.name}</small>
        </div>
      </Link>
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

/** «عملية جديدة» في الشريط العلوي، ومعاه اختصار N من أي صفحة */
function AddButton() {
  const canRecord = useCanRecord();
  const openTransaction = useQuickAdd();

  useEffect(() => {
    if (!canRecord) return undefined;
    const onKey = (event) => {
      if (event.code !== 'KeyN' || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      openTransaction();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canRecord, openTransaction]);

  if (!canRecord) return null;
  return (
    <Button variant="primary" icon="plus" className="add-btn" onClick={() => openTransaction()} title="عملية جديدة (اختصار: N)" aria-keyshortcuts="N">
      عملية جديدة <kbd aria-hidden="true">N</kbd>
    </Button>
  );
}

/**
 * الشريط السفلي يُرسم خارج الشريط العلوي عمدًا: `backdrop-filter` على الشريط
 * العلوي يخلّي أي عنصر fixed جوّاه يتموضع بالنسبة له مش للشاشة.
 */
function TabBar({ onMore }) {
  const allowed = useAllowed();
  const canRecord = useCanRecord();
  const openTransaction = useQuickAdd();
  const { pathname } = useLocation();
  const items = TABS.filter((item) => (item.add ? canRecord : item.more || allowed(item)));
  const inTabs = items.some((item) => item.to && (item.end ? pathname === item.to : pathname.startsWith(item.to)));

  return (
    <nav className="tabbar" aria-label="التنقّل السريع" style={{ '--tabs': items.length }}>
      {items.map((item) => {
        if (item.add) {
          return (
            <div key="add" className="coin-cell">
              <button type="button" className="coin" onClick={() => openTransaction()} aria-label="عملية جديدة">
                <Icon name="plus" size={26} strokeWidth={2.4} />
              </button>
            </div>
          );
        }
        if (item.more) {
          return (
            <button key="more" type="button" className={inTabs ? '' : 'active'} onClick={onMore} aria-haspopup="dialog">
              <Icon name="menu" size={22} />
              <span>المزيد</span>
            </button>
          );
        }
        return (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
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
          <div className="sidebar in-drawer"><SidebarContent onNavigate={() => setDrawer(false)} /></div>
        </Drawer>

        <header className="topbar">
          <Link to="/" className="mobile-brand" aria-label="مصروفي: الرئيسية">
            <Logo size={30} />
            <span className="wordmark">مصروفي</span>
          </Link>
          <span className="household"><Icon name="home" size={16} />{user.household.name}</span>
          <span className="grow" />
          <AddButton />
          <ThemeToggle />
        </header>
        <TabBar onMore={() => setDrawer(true)} />

        <main className="main" id="main">
          {!online && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <Notice tone="warning" icon="wifi">مفيش اتصال بالإنترنت. اللي هتسجّله دلوقتي مش هيتحفظ لحد ما النت يرجع.</Notice>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </QuickAddProvider>
  );
}
