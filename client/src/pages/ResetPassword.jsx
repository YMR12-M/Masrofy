import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Emblem, Field, Input, Notice } from '../components/ui/index.js';

export default function ResetPassword() {
  useDocumentTitle('كلمة مرور جديدة');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const form = useForm({ new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState(null);
  const [expired, setExpired] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!form.values.new_password) { form.setErrors({ new_password: 'اكتب الكلمة الجديدة' }); return; }
    if (form.values.new_password !== form.values.confirm) { form.setErrors({ confirm: 'الكلمتين مش زي بعض' }); return; }
    setBusy(true);
    setMessage(null);
    try {
      await api.post('/auth/reset-password', { token, new_password: form.values.new_password }, { auth: false });
      setDone(true);
    } catch (error) {
      // رسالة السيرفر عامة؛ هنا بنقول السبب ونقترح الحل
      setMessage(error.code === 'RESET_INVALID' ? 'الرابط ده بطّل أو اتستخدم قبل كده. اطلب رابط جديد.' : form.fail(error));
      setExpired(error.code === 'RESET_INVALID');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="الرابط ناقص" footer={<p className="center small"><Link to="/login">رجوع لتسجيل الدخول</Link></p>}>
        <div className="auth-state">
          <Emblem icon="alert" tone="danger" />
          <p>الرابط ده مش كامل. افتحه من البريد مرّة تانية، أو اطلب رابط جديد.</p>
          <Link className="btn primary" to="/forgot-password">اطلب رابط جديد</Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="اتغيّرت كلمة المرور">
        <div className="auth-state">
          <Emblem icon="check" />
          <p>خلاص، ادخل دلوقتي بالكلمة الجديدة. وأي جهاز كان داخل بالكلمة القديمة اتقفل.</p>
          <Link className="btn primary lg block" to="/login">تسجيل الدخول</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="اختار كلمة مرور جديدة" footer={<p className="center small"><Link to="/login">رجوع لتسجيل الدخول</Link></p>}>
      <form className="stack" onSubmit={submit} noValidate>
        {message && (
          <Notice tone="danger" icon="alert" action={expired && <Link className="btn secondary sm" to="/forgot-password">رابط جديد</Link>}>
            {message}
          </Notice>
        )}
        <Field label="كلمة المرور الجديدة" hint="10 حروف على الأقل، فيها حروف وأرقام أو رموز" error={form.errors.new_password}>
          {(props) => <Input {...props} type="password" autoComplete="new-password" autoFocus dir="ltr" className="ltr-input" value={form.values.new_password} onChange={form.on('new_password')} />}
        </Field>
        <Field label="اكتبها تاني" error={form.errors.confirm}>
          {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.confirm} onChange={form.on('confirm')} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>حفظ الكلمة الجديدة</Button>
      </form>
    </AuthLayout>
  );
}
