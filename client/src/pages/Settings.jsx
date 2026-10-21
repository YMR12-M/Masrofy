/**
 * الإعدادات: الأسرة (لصاحبها والمشرف، والباقي يشوفها بس)، بياناتي، المظهر،
 * كلمة المرور، والأجهزة المسجّل منها الدخول. كل قسم عنوانه وشرحه جنب بطاقته.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { formatDateTime, formatDayMonth } from '../lib/format.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { Icon } from '../lib/icons.jsx';
import { periodOf, periodRange, todayIn } from '../lib/period.js';
import {
  Button, Card, EmptyState, ErrorState, Field, Input, ListSkeleton, Notice, PageHead, Segmented, Select, useConfirm,
} from '../components/ui/index.js';

const CURRENCIES = [
  ['EGP', 'جنيه مصري'], ['USD', 'دولار أمريكي'], ['EUR', 'يورو'], ['SAR', 'ريال سعودي'],
  ['AED', 'درهم إماراتي'], ['KWD', 'دينار كويتي'], ['QAR', 'ريال قطري'], ['GBP', 'جنيه إسترليني'],
];

/** فيه حاجة اتغيّرت عن القيم المحفوظة؟ (زرار الحفظ مقفول لحد ما يبقى فيه) */
const changed = (values, saved) => Object.keys(saved).some((key) => String(values[key] ?? '') !== String(saved[key] ?? ''));

function Section({ title, description, children }) {
  return (
    <section className="settings-section" aria-label={title}>
      <div className="settings-intro">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

function HouseholdSettings() {
  const { user, reloadUser, can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const manage = can('household.manage');
  const saved = {
    name: user.household.name,
    month_start_day: user.household.month_start_day,
    currency: user.household.currency,
  };
  const form = useForm(() => saved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const dirty = changed(form.values, saved);

  // معاينة الشهر المالي الحالي باليوم المختار
  const startDay = Number(form.values.month_start_day) || 1;
  const range = periodRange(periodOf(todayIn(user.household.timezone), startDay), startDay);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.patch('/household', { ...form.values, month_start_day: Number(form.values.month_start_day) });
      await reloadUser();
      // بداية الشهر والعملة بيغيّروا كل الأرقام المعروضة
      queryClient.invalidateQueries();
      toast.success('اتحفظت إعدادات الأسرة');
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="الأسرة"
      description={manage ? 'بتسري على كل أفراد الأسرة: الاسم، يوم بداية الشهر المالي، والعملة.' : 'صاحب الأسرة أو المشرف بس يقدر يغيّر الإعدادات دي.'}
    >
      <Card
        footer={manage && (
          <div className="form-actions">
            {dirty && <span className="note">فيه تغييرات لسه ما اتحفظتش</span>}
            {dirty && <Button size="sm" variant="ghost" onClick={() => { form.reset(saved); setMessage(null); }}>تراجع</Button>}
            <Button type="submit" form="household-form" variant="primary" loading={busy} disabled={!dirty}>حفظ</Button>
          </div>
        )}
      >
        <form id="household-form" className="stack" onSubmit={submit} noValidate>
          {message && <Notice tone="danger" icon="alert">{message}</Notice>}
          <fieldset disabled={!manage} className="bare-fieldset form-grid">
            <Field label="اسم الأسرة" error={form.errors.name} className="full">
              {(props) => <Input {...props} value={form.values.name} onChange={form.on('name')} maxLength={120} />}
            </Field>
            <Field
              label="بداية الشهر المالي"
              hint={`يوم القبض. الشهر الحالي كده: من ${formatDayMonth(range.from)} لـ ${formatDayMonth(range.to)}`}
              error={form.errors.month_start_day}
            >
              {(props) => (
                <Select {...props} value={form.values.month_start_day} onChange={form.on('month_start_day')}>
                  {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>{day === 1 ? 'أول الشهر (1)' : `يوم ${day}`}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="العملة" hint="بتغيّر طريقة العرض بس، ومفيش تحويل للمبالغ المسجّلة" error={form.errors.currency}>
              {(props) => (
                <Select {...props} value={form.values.currency} onChange={form.on('currency')}>
                  {CURRENCIES.map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}
                </Select>
              )}
            </Field>
          </fieldset>
        </form>
      </Card>
    </Section>
  );
}

function ProfileSettings() {
  const { user, reloadUser } = useAuth();
  const toast = useToast();
  const saved = { full_name: user.full_name, phone: user.phone ?? '' };
  const form = useForm(() => saved);
  const [busy, setBusy] = useState(false);
  const dirty = changed(form.values, saved);

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
    <Section title="بياناتي" description="اسمك زي ما بيظهر لباقي الأسرة في العمليات والسجل.">
      <Card
        footer={(
          <div className="form-actions">
            {dirty && <Button size="sm" variant="ghost" onClick={() => form.reset(saved)}>تراجع</Button>}
            <Button type="submit" form="profile-form" variant="primary" loading={busy} disabled={!dirty}>حفظ</Button>
          </div>
        )}
      >
        <form id="profile-form" className="form-grid" onSubmit={submit} noValidate>
          <Field label="الاسم" error={form.errors.full_name}>
            {(props) => <Input {...props} autoComplete="name" value={form.values.full_name} onChange={form.on('full_name')} maxLength={120} />}
          </Field>
          <Field label="الموبايل" hint="اختياري" error={form.errors.phone}>
            {(props) => <Input {...props} type="tel" autoComplete="tel" dir="ltr" className="ltr-input" value={form.values.phone} onChange={form.on('phone')} placeholder="01xxxxxxxxx" />}
          </Field>
          <Field label="البريد الإلكتروني" hint="بتدخل بيه. لو عايز تغيّره كلّم صاحب الأسرة" className="full">
            {(props) => <Input {...props} value={user.email} dir="ltr" className="ltr-input" disabled />}
          </Field>
        </form>
      </Card>
    </Section>
  );
}

function AppearanceSettings() {
  const { preference, setPreference } = useTheme();
  return (
    <Section title="المظهر" description="«زي الجهاز» بيقلب فاتح أو داكن مع إعداد الموبايل أو الكمبيوتر.">
      <Card>
        <Segmented
          block
          label="المظهر"
          value={preference}
          onChange={setPreference}
          options={[{ value: 'auto', label: 'زي الجهاز', icon: 'monitor' }, { value: 'light', label: 'فاتح', icon: 'sun' }, { value: 'dark', label: 'داكن', icon: 'moon' }]}
        />
      </Card>
    </Section>
  );
}

const EMPTY_PASSWORDS = { current_password: '', new_password: '', confirm: '' };

function PasswordSettings() {
  const { adoptSession } = useAuth();
  const toast = useToast();
  const form = useForm(EMPTY_PASSWORDS);
  const [busy, setBusy] = useState(false);
  const filled = Object.values(form.values).every(Boolean);

  async function submit(event) {
    event.preventDefault();
    if (form.values.new_password !== form.values.confirm) { form.setErrors({ confirm: 'الكلمتين مش زي بعض' }); return; }
    setBusy(true);
    try {
      const session = await api.post('/auth/change-password', { current_password: form.values.current_password, new_password: form.values.new_password });
      await adoptSession(session);
      form.reset(EMPTY_PASSWORDS);
      toast.success('اتغيّرت كلمة المرور، واتقفلت الجلسات على الأجهزة التانية');
    } catch (error) {
      const message = form.fail(error);
      if (message) toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="كلمة المرور" description="لما تغيّرها هنقفل الدخول على كل الأجهزة التانية، والجهاز ده هيفضل داخل.">
      <Card
        footer={(
          <div className="form-actions">
            <Button type="submit" form="password-form" variant="primary" loading={busy} disabled={!filled}>تغيير كلمة المرور</Button>
          </div>
        )}
      >
        <form id="password-form" className="form-grid" onSubmit={submit} noValidate>
          <Field label="الكلمة الحالية" error={form.errors.current_password} className="full">
            {(props) => <Input {...props} type="password" autoComplete="current-password" dir="ltr" className="ltr-input" value={form.values.current_password} onChange={form.on('current_password')} />}
          </Field>
          <Field label="الكلمة الجديدة" hint="10 حروف على الأقل، فيها حروف وأرقام أو رموز" error={form.errors.new_password}>
            {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.new_password} onChange={form.on('new_password')} />}
          </Field>
          <Field label="اكتبها تاني" error={form.errors.confirm}>
            {(props) => <Input {...props} type="password" autoComplete="new-password" dir="ltr" className="ltr-input" value={form.values.confirm} onChange={form.on('confirm')} />}
          </Field>
        </form>
      </Card>
    </Section>
  );
}

const CLIENT_LABELS = { web: 'متصفح', mobile: 'موبايل', desktop: 'كمبيوتر' };

/** «Chrome على Mac» من بصمة المتصفح، وإلا نوع الجهاز */
function describeDevice(session) {
  const agent = session.user_agent ?? '';
  const browser = [[/Edg\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/Firefox\//, 'Firefox'], [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari']]
    .find(([pattern]) => pattern.test(agent))?.[1];
  const system = [[/iPhone/, 'iPhone'], [/iPad/, 'iPad'], [/Android/, 'Android'], [/Windows/, 'Windows'], [/Mac OS X|Macintosh/, 'Mac'], [/Linux/, 'Linux']]
    .find(([pattern]) => pattern.test(agent))?.[1];
  const phone = session.client_type === 'mobile' || ['iPhone', 'Android'].includes(system);
  const label = browser && system ? `${browser} على ${system}` : (browser ?? system ?? CLIENT_LABELS[session.client_type] ?? session.client_type);
  return { label, icon: phone ? 'phone' : 'monitor' };
}

function SessionsSettings() {
  const { logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get('/auth/sessions') });
  const [busy, setBusy] = useState(null);

  async function revoke(session) {
    setBusy(session.id);
    try {
      await api.del(`/auth/sessions/${session.id}`);
      await sessions.refetch();
      toast.success('اتقفل الدخول من الجهاز ده');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(null);
    }
  }

  async function logoutAll() {
    if (!(await confirm({ title: 'خروج من كل الأجهزة؟', message: 'هتحتاج تسجّل الدخول تاني على كل جهاز، ومنها الجهاز ده.', confirmLabel: 'خروج من الكل', danger: true }))) return;
    setBusy('all');
    try {
      await api.post('/auth/logout-all');
      await logout();
    } catch (error) {
      toast.error(error.message);
      setBusy(null);
    }
  }

  const list = sessions.data ?? [];
  return (
    <Section title="الأجهزة" description="الأماكن اللي داخل منها دلوقتي. لو فيه جهاز مش عارفه اقفله، وغيّر كلمة المرور.">
      <Card
        flush
        footer={list.length > 0 && (
          <div className="form-actions">
            <Button variant="danger-ghost" size="sm" icon="logout" loading={busy === 'all'} disabled={Boolean(busy)} onClick={logoutAll}>خروج من كل الأجهزة</Button>
          </div>
        )}
      >
        {sessions.isLoading && <ListSkeleton rows={2} />}
        {sessions.isError && <ErrorState error={sessions.error} onRetry={sessions.refetch} />}
        {sessions.isSuccess && list.length === 0 && <EmptyState icon="monitor" title="مفيش أجهزة تانية" description="مش داخل من أي مكان غير هنا." />}
        <div className="list">
          {list.map((session) => {
            const device = describeDevice(session);
            return (
              <div key={session.id} className="list-item">
                <span className="cat-icon" style={{ '--cat': 'var(--text-muted)' }} aria-hidden="true"><Icon name={device.icon} size={18} /></span>
                <div className="grow">
                  <div className="title truncate">{device.label}</div>
                  <div className="meta truncate" title={session.user_agent ?? undefined}>
                    آخر نشاط {formatDateTime(session.last_active_at)}
                    {session.ip_address && <> · <span className="num">{session.ip_address}</span></>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" loading={busy === session.id} disabled={Boolean(busy)} onClick={() => revoke(session)} aria-label={`قفل الدخول من ${device.label}`}>
                  قفل
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </Section>
  );
}

export default function Settings() {
  useDocumentTitle('الإعدادات');
  return (
    <div className="page">
      <PageHead title="الإعدادات" description="إعدادات الأسرة وحسابك والمظهر" />
      <div className="settings">
        <HouseholdSettings />
        <ProfileSettings />
        <AppearanceSettings />
        <PasswordSettings />
        <SessionsSettings />
      </div>
    </div>
  );
}
