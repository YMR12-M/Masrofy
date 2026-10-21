import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Shell from './components/layout/Shell.jsx';
import { Loading } from './components/ui/index.js';

// الصفحات تُحمَّل عند الطلب: شاشة الدخول لا تنتظر كود التقارير
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const MustChangePassword = lazy(() => import('./pages/MustChangePassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const Accounts = lazy(() => import('./pages/Accounts.jsx'));
const Budgets = lazy(() => import('./pages/Budgets.jsx'));
const Bills = lazy(() => import('./pages/Bills.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Members = lazy(() => import('./pages/Members.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

/** حارس: لازم مستخدم مسجَّل، وإلا شاشة الدخول (مع حفظ الوجهة للعودة إليها) */
function RequireAuth({ children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="جارٍ فتح الجلسة…" />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  return children;
}

/**
 * صفحات الزائر فقط. بعد الدخول/التسجيل يتحوّل هذا الحارس نفسه للوجهة
 * (الصفحة التي طلبها قبل الدخول، أو `redirect`) — لو تركنا التحويل للصفحة
 * لسبقها الحارس بتحويل للرئيسية لحظة تغيّر الحالة.
 */
function GuestOnly({ children, redirect = '/' }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'authenticated') return <Navigate to={location.state?.from ?? redirect} replace />;
  return children;
}

/** صفحة تحتاج صلاحية: غيرها يرجع للرئيسية بدل صفحة خطأ */
function Allow({ any, children }) {
  const { can } = useAuth();
  return any.some((permission) => can(permission)) ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { status, user } = useAuth();
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly redirect="/accounts?welcome=1"><Register /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/change-password"
          element={status === 'authenticated' && user.must_change_password ? <MustChangePassword /> : <Navigate to="/" replace />}
        />

        <Route element={<RequireAuth><Shell /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Allow any={['accounts.read', 'accounts.own']}><Transactions /></Allow>} />
          <Route path="accounts" element={<Allow any={['accounts.read', 'accounts.own']}><Accounts /></Allow>} />
          <Route path="bills" element={<Allow any={['accounts.read', 'accounts.own']}><Bills /></Allow>} />
          <Route path="budgets" element={<Allow any={['budgets.read']}><Budgets /></Allow>} />
          <Route path="reports" element={<Allow any={['reports.read']}><Reports /></Allow>} />
          <Route path="categories" element={<Allow any={['categories.manage']}><Categories /></Allow>} />
          <Route path="members" element={<Members />} />
          <Route path="audit" element={<Allow any={['audit.read']}><Audit /></Allow>} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
