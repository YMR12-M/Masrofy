import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Emblem, Field, Input, Notice } from '../components/ui/index.js';

export default function ForgotPassword() {
  useDocumentTitle('نسيت كلمة المرور');
  const form = useForm({ email: '' });
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [message, setMessage] = useState(null);

  async function send(email) {
    setBusy(true);
    setMessage(null);
    try {
      await api.post('/auth/forgot-password', { email }, { auth: false });
      setSentTo(email);
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const email = form.values.email.trim();
    if (!email) { form.setErrors({ email: 'اكتب بريدك' }); return; }
    send(email);
  }

  const footer = <p className="center small"><Link to="/login">رجوع لتسجيل الدخول</Link></p>;

  if (sentTo) {
    return (
      <AuthLayout title="بص على بريدك" footer={footer}>
        <div className="auth-state">
          <Emblem icon="check" />
          <p>لو <span className="num bold">{sentTo}</span> متسجّل عندنا، هيوصلك رابط تختار بيه كلمة مرور جديدة خلال دقايق.</p>
          <p className="small muted">مش لاقيه؟ بص في الـ Spam أو الرسائل غير المهمة.</p>
          {message && <Notice tone="danger" icon="alert">{message}</Notice>}
          <div className="row wrap">
            <Button loading={busy} onClick={() => send(sentTo)}>ابعت تاني</Button>
            <Button variant="ghost" onClick={() => setSentTo(null)}>بريد تاني</Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="نسيت كلمة المرور؟" subtitle="اكتب بريدك وهنبعتلك رابط تختار بيه كلمة جديدة." footer={footer}>
      <form className="stack" onSubmit={submit} noValidate>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        <Field label="البريد الإلكتروني" error={form.errors.email}>
          {(props) => <Input {...props} type="email" autoComplete="email" autoFocus dir="ltr" className="ltr-input" value={form.values.email} onChange={form.on('email')} placeholder="name@example.com" />}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>ابعت الرابط</Button>
      </form>
    </AuthLayout>
  );
}
