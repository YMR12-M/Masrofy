/**
 * الإعدادات: الأسرة (لصاحبها والمشرف)، الملف الشخصي، كلمة المرور،
 * المظهر، والأجهزة المسجّل منها الدخول.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import {
  Button, Card, Field, Input, Notice, Segmented, Select, useConfirm,
} from '../components/ui/index.js';

const CURRENCIES = [
  ['EGP', 'جنيه مصري'], ['USD', 'دولار أمريكي'], ['EUR', 'يورو'], ['SAR', 'ريال سعودي'],
  ['AED', 'درهم إماراتي'], ['KWD', 'دينار كويتي'], ['QAR', 'ريال قطري'], ['GBP', 'جنيه إسترليني'],
];

function HouseholdSettings() {
  const { user, reloadUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm(() => ({
    name: user.household.name,
    month_start_day: user.household.month_start_day,
    currency: user.household.currency,
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.patch('/household', { ...form.values, month_start_day: Number(form.values.month_start_day) });
      await reloadUser();
      // بداية الشهر والعملة يغيّران كل الأرقام المعروضة
      queryClient.invalidateQueries();
      toast.success('اتحفظت إعدادات الأسرة');
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="الأسرة">
      <form className="stack" onSubmit={submit} noValidate>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        <div className="form-grid">
          <Field label="اسم الأسرة" error={form.errors.name}>
            {(props) => <Input {...props} value={form.values.name} onChange={form.on('name')} maxLength={120} />}
          </Field>
          <Field label="بداية الشهر المالي" hint="يوم القبض. لو 25: شهر أكتوبر = من 25 أكتوبر لـ 24 نوفمبر" error={form.errors.month_start_day}>
            {(props) => (
              <Select {...props} value={form.values.month_start_day} onChange={form.on('month_start_day')}>
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>{day === 1 ? 'أول الشهر (1)' : `يوم ${day}`}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="العملة" hint="تغيير العملة بيغيّر طريقة العرض بس، ومفيش تحويل للمبالغ المسجّلة" error={form.errors.currency}>
            {(props) => (
              <Select {...props} value={form.values.currency} onChange={form.on('currency')}>
                {CURRENCIES.map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div><Button type="submit" variant="primary" loading={busy}>حفظ</Button></div>
      </form>
    </Card>
  );
}

function ProfileSettings() {
  const { user, reloadUser } = useAuth();
  const toast = useToast();
  const form = useForm(() => ({ full_name: user.full_name, phone: user.phone ?? '' }));
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.patch('/auth/me', form.values);
      await reloadUser();
      toast.success('اتحفظت بياناتك');
    } catch (error) {
      const message = form.fail(error);
      if (message) toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="بياناتي">
      <form className="stack" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="الاسم" error={form.errors.full_name}>
            {(props) => <Input {...props} value={form.values.full_name} onChange={form.on('full_name')} maxLength={120} />}
          </Field>
          <Field label="الموبايل" error={form.errors.phone}>
            {(props) => <Input {...props} type="tel" dir="ltr" className="ltr-input" value={form.values.phone} onChange={form.on('phone')} />}
          </Field>
          <Field label="البريد الإلكتروني" hint="للتغيير كلّم صاحب الأسرة">
            {(props) => <Input {...props} value={user.email} dir="ltr" className="ltr-input" disabled />}
          </Field>
        </div>
        <div><Button type="submit" variant="primary" loading={busy}>حفظ</Button></div>
      </form>
    </Card>
  );
}

function PasswordSettings() {
  const { adoptSession } = useAuth();
  const toast = useToast();
  const form = useForm({ current_password: '', new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (form.values.new_password !== form.values.confirm) { form.setErrors({ confirm: 'الكلمتين مش زي بعض' }); return; }
    setBusy(true);
    try {
      const session = await api.post('/auth/change-password', { current_password: form.values.current_password, new_password: form.values.new_password });
      await adoptSession(session);
      form.reset({ current_password: '', new_password: '', confirm: '' });
      toast.success('اتغيّرت كلمة المرور، واتقفلت الجلسات على الأجهزة التانية');
    } catch (error) {
      const message = form.fail(error);
      if (message) toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="كلمة المرور">
      <form className="stack" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="الكلمة الحالية" error={form.errors.current_password} className="full">
            {(props) => <Input {...props} type="password" autoComplete="current-password" dir="ltr" className="ltr-input" value={form.values.current_password} onChange={form.on('current_password')} />}
          </Field>
          <Field label="الكلمة الجديدة" error={form.errors.new_password}>
            {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.new_password} onChange={form.on('new_password')} />}
          </Field>
          <Field label="أكّدها" error={form.errors.confirm}>
            {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.confirm} onChange={form.on('confirm')} />}
          </Field>
        </div>
        <div><Button type="submit" loading={busy}>تغيير كلمة المرور</Button></div>
      </form>
    </Card>
  );
}

const CLIENT_LABELS = { web: 'متصفح', mobile: 'موبايل', desktop: 'كمبيوتر' };

function SessionsSettings() {
  const { logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get('/auth/sessions') });

  async function revoke(session) {
    try {
      await api.del(`/auth/sessions/${session.id}`);
      await sessions.refetch();
      toast.success('اتقفلت الجلسة');
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function logoutAll() {
    if (!(await confirm({ title: 'خروج من كل الأجهزة؟', message: 'هتحتاج تسجّل الدخول تاني على كل جهاز، ومنها الجهاز ده.', confirmLabel: 'خروج من الكل', danger: true }))) return;
    await api.post('/auth/logout-all');
    await logout();
  }

  return (
    <Card title="الأجهزة" actions={<Button variant="danger-ghost" size="sm" onClick={logoutAll}>خروج من كل الأجهزة</Button>} flush>
      <div className="list">
        {(sessions.data ?? []).map((session) => (
          <div key={session.id} className="list-item">
            <div className="grow">
              <div className="title">{CLIENT_LABELS[session.client_type] ?? session.client_type}</div>
              <div className="meta truncate" title={session.user_agent}>آخر نشاط {formatDateTime(session.last_active_at)} · <span className="num">{session.ip_address}</span></div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => revoke(session)}>قفل</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Settings() {
  useDocumentTitle('الإعدادات');
  const { can } = useAuth();
  const { preference, setPreference } = useTheme();

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <h1>الإعدادات</h1>
      {can('household.manage') && <HouseholdSettings />}
      <ProfileSettings />
      <Card title="المظهر">
        <Segmented
          label="المظهر"
          value={preference}
          onChange={setPreference}
          options={[{ value: 'auto', label: 'زي الجهاز', icon: 'monitor' }, { value: 'light', label: 'فاتح', icon: 'sun' }, { value: 'dark', label: 'داكن', icon: 'moon' }]}
        />
      </Card>
      <PasswordSettings />
      <SessionsSettings />
    </div>
  );
}
