/** إضافة حساب أو تعديله: النوع، المشترك/الخاص، الرصيد الافتتاحي… */
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { useForm } from '../../lib/forms.js';
import { ACCOUNT_TYPE, ACCOUNT_TYPES } from '../../lib/constants.js';
import { Icon } from '../../lib/icons.jsx';
import { useRefreshMoney } from '../../lib/queries.js';
import {
  AccountMark, Badge, Button, ColorPicker, Field, Input, Modal, MoneyInput, Notice, Segmented, Switch,
} from '../ui/index.js';

const INSTITUTION_HINTS = {
  bank: 'مثلًا: البنك الأهلي، بنك مصر، CIB',
  wallet: 'مثلًا: فودافون كاش، إنستاباي، اتصالات كاش',
  card: 'مثلًا: فيزا بنك مصر',
};
const SCOPE_HINTS = {
  shared: 'كل الأسرة تشوفه، واللي ليه صلاحية يسجّل عليه.',
  private: 'مش هيظهر لأي حد غيرك، ولا حتى في تقارير الأسرة.',
};

/** نوع الحساب: مربّعات راديو بأيقونة كل نوع، نفس أيقونة علامة الحساب */
function TypePicker({ value, onChange }) {
  return (
    <div className="choice-grid" role="radiogroup" aria-label="نوع الحساب">
      {ACCOUNT_TYPES.map((type) => (
        <label key={type.value} className="choice">
          <input type="radio" name="account-type" value={type.value} aria-label={type.label} checked={value === type.value} onChange={() => onChange(type.value)} />
          <Icon name={type.icon} size={18} />
          <span>{type.label}</span>
        </label>
      ))}
    </div>
  );
}

function AccountDialog({ account, onClose }) {
  const { user, can } = useAuth();
  const toast = useToast();
  const refreshMoney = useRefreshMoney();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const editing = Boolean(account);
  const currency = user.household.currency;

  const canShared = can('accounts.manage');
  const canPrivate = can('accounts.own');
  const form = useForm(() => ({
    name: account?.name ?? '',
    type: account?.type ?? 'cash',
    scope: account ? (account.is_shared ? 'shared' : 'private') : (canShared ? 'shared' : 'private'),
    institution: account?.institution ?? '',
    opening_balance_minor: account?.opening_balance_minor ?? 0,
    credit_limit_minor: account?.credit_limit_minor ?? null,
    color: account?.color ?? '#0369a1',
    include_in_net_worth: account?.include_in_net_worth ?? true,
  }));
  const { values, set } = form;

  async function submit(event) {
    event.preventDefault();
    if (!values.name.trim()) { form.setErrors({ name: 'اكتب اسم للحساب' }); return; }
    setBusy(true);
    setMessage(null);
    const body = {
      name: values.name,
      type: values.type,
      institution: values.institution,
      opening_balance_minor: values.opening_balance_minor ?? 0,
      credit_limit_minor: values.type === 'card' ? values.credit_limit_minor : null,
      color: values.color,
      include_in_net_worth: values.include_in_net_worth,
    };
    try {
      if (editing) await api.patch(`/accounts/${account.id}`, body);
      else await api.post('/accounts', { ...body, scope: values.scope });
      refreshMoney();
      toast.success(editing ? 'اتعدّل الحساب' : 'اتضاف الحساب');
      onClose();
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  const type = ACCOUNT_TYPE[values.type];
  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'تعديل الحساب' : 'حساب جديد'}
      footer={(
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" type="submit" form="account-form" loading={busy}>{editing ? 'حفظ' : 'إضافة'}</Button>
        </>
      )}
    >
      <form id="account-form" className="stack" noValidate onSubmit={submit}>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}

        <div className="form-preview" aria-hidden="true">
          <AccountMark account={{ type: values.type, color: values.color }} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="title truncate">{values.name.trim() || 'اسم الحساب'}</div>
            <div className="meta truncate">{values.institution.trim() || type?.label}</div>
          </div>
          {values.scope === 'private' ? <Badge tone="primary"><Icon name="lock" size={12} /> خاص</Badge> : <Badge>مشترك</Badge>}
        </div>

        <Field label="اسم الحساب" error={form.errors.name} required>
          {(props) => <Input {...props} data-autofocus value={values.name} onChange={form.on('name')} maxLength={80} placeholder="مثلًا: كاش البيت" />}
        </Field>

        <Field label="النوع" error={form.errors.type}>
          {() => <TypePicker value={values.type} onChange={(next) => set('type', next)} />}
        </Field>

        {values.type !== 'cash' && (
          <Field label="البنك أو الجهة" hint={INSTITUTION_HINTS[values.type]} error={form.errors.institution}>
            {(props) => <Input {...props} value={values.institution} onChange={form.on('institution')} maxLength={80} />}
          </Field>
        )}

        {!editing && canShared && canPrivate && (
          <Field label="مين يشوف الحساب ده؟" hint={SCOPE_HINTS[values.scope]}>
            {() => (
              <Segmented
                block
                label="ملكية الحساب"
                value={values.scope}
                onChange={(scope) => set('scope', scope)}
                options={[{ value: 'shared', label: 'الأسرة كلها', icon: 'users' }, { value: 'private', label: 'أنا بس', icon: 'lock' }]}
              />
            )}
          </Field>
        )}
        {!editing && !(canShared && canPrivate) && <p className="xsmall muted">{SCOPE_HINTS[values.scope]}</p>}

        <div className="form-grid">
          <Field
            label={editing ? 'الرصيد الافتتاحي' : 'الرصيد النهارده'}
            hint={values.type === 'card' ? 'لو عليك مديونية اكتبها بالسالب، مثلًا -2500' : 'الفلوس اللي في الحساب قبل أي عملية تسجّلها'}
            error={form.errors.opening_balance_minor}
            className={values.type === 'card' ? '' : 'full'}
          >
            {(props) => <MoneyInput {...props} allowNegative value={values.opening_balance_minor} onChange={(minor) => set('opening_balance_minor', minor)} currency={currency} />}
          </Field>
          {values.type === 'card' && (
            <Field label="حدّ البطاقة" hint="اختياري" error={form.errors.credit_limit_minor}>
              {(props) => <MoneyInput {...props} value={values.credit_limit_minor} onChange={(minor) => set('credit_limit_minor', minor)} currency={currency} />}
            </Field>
          )}
        </div>

        <Field label="اللون" hint="بيميّز الحساب في القوائم والتقارير">{() => <ColorPicker value={values.color} onChange={(color) => set('color', color)} />}</Field>

        <Switch
          checked={values.include_in_net_worth}
          onChange={(checked) => set('include_in_net_worth', checked)}
          label="يدخل في صافي الثروة"
          hint="اقفلها لحساب مش بتاعك فعليًّا، زي أمانة أو فلوس جمعية"
        />
      </form>
    </Modal>
  );
}

export default function AccountForm({ open, ...props }) {
  return open ? <AccountDialog {...props} /> : null;
}
