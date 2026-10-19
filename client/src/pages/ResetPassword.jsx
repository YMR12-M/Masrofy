import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Field, Input, Notice } from '../components/ui/index.js';

export default function ResetPassword() {
  useDocumentTitle('كلمة مرور جديدة');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const form = useForm({ new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (form.values.new_password !== form.values.confirm) {
      form.setErrors({ confirm: 'الكلمتين مش زي بعض' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.post('/auth/reset-password', { token, new_password: form.values.new_password }, { auth: false });
      setDone(true);
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="اختار كلمة مرور جديدة" footer={<p className="center small"><Link to="/login">تسجيل الدخول</Link></p>}>
      {!token && <Notice tone="danger" icon="alert">الرابط ناقص — افتحه من البريد مرّة تانية أو اطلب رابط جديد.</Notice>}
      {done ? (
        <Notice tone="success" icon="check">اتغيّرت كلمة المرور. <Link to="/login">ادخل دلوقتي</Link></Notice>
      ) : token && (
        <form className="stack" onSubmit={submit} noValidate>
          {message && <Notice tone="danger" icon="alert">{message} {message.includes('رابط') && <Link to="/forgot-password">اطلب رابط جديد</Link>}</Notice>}
          <Field label="كلمة المرور الجديدة" hint="10 حروف على الأقل وتجمع حروف وأرقام أو رموز" error={form.errors.new_password}>
            {(props) => <Input {...props} type="password" autoComplete="new-password" autoFocus dir="ltr" className="ltr-input" value={form.values.new_password} onChange={form.on('new_password')} />}
          </Field>
          <Field label="أكّدها" error={form.errors.confirm}>
            {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.confirm} onChange={form.on('confirm')} />}
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>حفظ</Button>
        </form>
      )}
    </AuthLayout>
  );
}
