import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Field, Input, Notice } from '../components/ui/index.js';

/** خيارات شاشة الدخول (هل التسجيل مفتوح؟) — بلا جلسة */
export const useAuthOptions = () => useQuery({
  queryKey: ['auth-options'],
  queryFn: () => api.get('/auth/options'),
  staleTime: Infinity,
});

export default function Login() {
  useDocumentTitle('تسجيل الدخول');
  const { login } = useAuth();
  const options = useAuthOptions();
  const form = useForm({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      // بعد النجاح يحوّلنا حارس GuestOnly للصفحة المطلوبة قبل الدخول (App.jsx)
      await login(form.values.email.trim(), form.values.password);
    } catch (error) {
      setMessage(form.fail(error));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="أهلًا بيك تاني"
      subtitle="سجّل الدخول لحساب أسرتك"
      footer={(
        <div className="stack sm center small">
          <Link to="/forgot-password">نسيت كلمة المرور؟</Link>
          {options.data?.signup_enabled && <span className="muted">أول مرة؟ <Link to="/register">افتح حساب لأسرتك</Link></span>}
        </div>
      )}
    >
      <form className="stack" onSubmit={submit} noValidate>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        <Field label="البريد الإلكتروني" error={form.errors.email}>
          {(props) => <Input {...props} type="email" autoComplete="username" autoFocus dir="ltr" className="ltr-input" value={form.values.email} onChange={form.on('email')} required />}
        </Field>
        <Field label="كلمة المرور" error={form.errors.password}>
          {(props) => <Input {...props} type="password" autoComplete="current-password" dir="ltr" className="ltr-input" value={form.values.password} onChange={form.on('password')} required />}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>دخول</Button>
      </form>
    </AuthLayout>
  );
}
