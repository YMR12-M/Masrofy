import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Field, Input, Notice } from '../components/ui/index.js';

export default function ForgotPassword() {
  useDocumentTitle('نسيت كلمة المرور');
  const form = useForm({ email: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post('/auth/forgot-password', { email: form.values.email.trim() }, { auth: false });
      setSent(result.message);
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="نسيت كلمة المرور؟"
      subtitle="اكتب بريدك وهنبعتلك رابط تختار بيه كلمة جديدة"
      footer={<p className="center small"><Link to="/login">رجوع لتسجيل الدخول</Link></p>}
    >
      {sent ? (
        <Notice tone="success" icon="check">{sent}</Notice>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {message && <Notice tone="danger" icon="alert">{message}</Notice>}
          <Field label="البريد الإلكتروني" error={form.errors.email}>
            {(props) => <Input {...props} type="email" autoComplete="email" autoFocus dir="ltr" className="ltr-input" value={form.values.email} onChange={form.on('email')} />}
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>ابعت الرابط</Button>
        </form>
      )}
    </AuthLayout>
  );
}
