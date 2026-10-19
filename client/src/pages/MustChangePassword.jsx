import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import { Button, Field, Input, Notice } from '../components/ui/index.js';

/** فرد أضافه صاحب الأسرة بكلمة مؤقتة: لازم يختار كلمته قبل أي حاجة */
export default function MustChangePassword() {
  useDocumentTitle('غيّر كلمة المرور');
  const { user, adoptSession, logout } = useAuth();
  const navigate = useNavigate();
  const form = useForm({ current_password: '', new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
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
      const session = await api.post('/auth/change-password', {
        current_password: form.values.current_password,
        new_password: form.values.new_password,
      });
      await adoptSession(session);
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={`أهلًا ${user.full_name}`}
      subtitle={`انضممت لأسرة «${user.household.name}». اختار كلمة مرور خاصة بيك بدل المؤقتة.`}
      footer={<p className="center small"><button type="button" className="btn ghost sm" onClick={logout}>خروج</button></p>}
    >
      <form className="stack" onSubmit={submit} noValidate>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        <Field label="الكلمة المؤقتة" error={form.errors.current_password}>
          {(props) => <Input {...props} type="password" autoComplete="current-password" autoFocus dir="ltr" className="ltr-input" value={form.values.current_password} onChange={form.on('current_password')} />}
        </Field>
        <Field label="كلمة المرور الجديدة" hint="10 حروف على الأقل وتجمع حروف وأرقام أو رموز" error={form.errors.new_password}>
          {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.new_password} onChange={form.on('new_password')} />}
        </Field>
        <Field label="أكّدها" error={form.errors.confirm}>
          {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.confirm} onChange={form.on('confirm')} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>حفظ ومتابعة</Button>
      </form>
    </AuthLayout>
  );
}
