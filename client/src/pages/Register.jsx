import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Field, Input, Loading, Notice } from '../components/ui/index.js';
import { useAuthOptions } from './Login.jsx';

/** حساب أسرة جديد: يفتح الأسرة وصاحبها وتصنيفات مقترحة، ثم يدخل مباشرة */
export default function Register() {
  useDocumentTitle('حساب جديد');
  const { register } = useAuth();
  const options = useAuthOptions();
  const form = useForm({ household_name: '', full_name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  if (options.isLoading) return <Loading />;
  if (options.data && !options.data.signup_enabled) return <Navigate to="/login" replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      // بعد النجاح يحوّلنا حارس GuestOnly إلى /accounts?welcome=1 (App.jsx)
      await register({ ...form.values, email: form.values.email.trim() });
    } catch (error) {
      setMessage(form.fail(error));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="افتح حساب لأسرتك"
      subtitle="دقيقة واحدة وتبدأ تسجّل مصاريفك"
      footer={<p className="center small muted">عندك حساب؟ <Link to="/login">سجّل الدخول</Link></p>}
    >
      <form className="stack" onSubmit={submit} noValidate>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        <Field label="اسم الأسرة" hint="بيظهر لكل أفراد الأسرة، مثلًا: بيت أحمد" error={form.errors.household_name} required>
          {(props) => <Input {...props} autoFocus value={form.values.household_name} onChange={form.on('household_name')} maxLength={120} />}
        </Field>
        <Field label="اسمك" error={form.errors.full_name} required>
          {(props) => <Input {...props} autoComplete="name" value={form.values.full_name} onChange={form.on('full_name')} maxLength={120} />}
        </Field>
        <Field label="البريد الإلكتروني" error={form.errors.email} required>
          {(props) => <Input {...props} type="email" autoComplete="email" dir="ltr" className="ltr-input" value={form.values.email} onChange={form.on('email')} />}
        </Field>
        <Field label="الموبايل" hint="اختياري" error={form.errors.phone}>
          {(props) => <Input {...props} type="tel" autoComplete="tel" dir="ltr" className="ltr-input" value={form.values.phone} onChange={form.on('phone')} placeholder="01xxxxxxxxx" />}
        </Field>
        <Field label="كلمة المرور" hint="10 حروف على الأقل وتجمع حروف وأرقام أو رموز" error={form.errors.password} required>
          {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.password} onChange={form.on('password')} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>إنشاء الحساب</Button>
      </form>
    </AuthLayout>
  );
}
