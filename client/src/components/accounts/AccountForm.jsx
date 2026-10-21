/** إضافة حساب أو تعديله: النوع، المشترك/الخاص، الرصيد الافتتاحي… */
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { useForm } from '../../lib/forms.js';
import { ACCOUNT_TYPES } from '../../lib/constants.js';
import { useRefreshMoney } from '../../lib/queries.js';
import {
  Button, ColorPicker, Field, Input, Modal, MoneyInput, Notice, Segmented, Select, Switch,
} from '../ui/index.js';

const INSTITUTION_HINTS = {
  bank: 'مثلًا: البنك الأهلي، بنك مصر، CIB',
  wallet: 'مثلًا: فودافون كاش، إنستاباي، اتصالات كاش',
  card: 'مثلًا: فيزا بنك مصر',
};

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
    color: account?.color ?? '#0d6b57',
    include_in_net_worth: account?.include_in_net_worth ?? true,
  }));
  const { values, set } = form;

  async function submit(event) {
    event.preventDefault();
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

        <Field label="اسم الحساب" error={form.errors.name} required>
          {(props) => <Input {...props} data-autofocus value={values.name} onChange={form.on('name')} maxLength={80} placeholder="مثلًا: كاش البيت" />}
        </Field>

        <div className="form-grid">
          <Field label="النوع" error={form.errors.type}>
            {(props) => (
              <Select {...props} value={values.type} onChange={form.on('type')}>
                {ACCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="البنك / الجهة" hint={INSTITUTION_HINTS[values.type]} error={form.errors.institution}>
            {(props) => <Input {...props} value={values.institution} onChange={form.on('institution')} maxLength={80} />}
          </Field>
        </div>

        {!editing && canShared && canPrivate && (
          <Field label="مين يشوف الحساب ده؟">
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
        {!editing && values.scope === 'private' && (
          <p className="xsmall muted">الحساب الخاص مش هيظهر لأي حد غيرك، ولا حتى في تقارير الأسرة.</p>
        )}

        <div className="form-grid">
          <Field
            label="الرصيد الافتتاحي"
            hint={values.type === 'card' ? 'لو عليك مديونية اكتبها بالسالب (مثلًا −2500)' : 'الفلوس اللي في الحساب النهارده قبل أي عملية'}
            error={form.errors.opening_balance_minor}
          >
            {(props) => <MoneyInput {...props} allowNegative value={values.opening_balance_minor} onChange={(minor) => set('opening_balance_minor', minor)} currency={currency} />}
          </Field>
          {values.type === 'card' && (
            <Field label="حدّ البطاقة" error={form.errors.credit_limit_minor}>
              {(props) => <MoneyInput {...props} value={values.credit_limit_minor} onChange={(minor) => set('credit_limit_minor', minor)} currency={currency} />}
            </Field>
          )}
        </div>

        <Field label="اللون">{() => <ColorPicker value={values.color} onChange={(color) => set('color', color)} />}</Field>

        <Switch
          checked={values.include_in_net_worth}
          onChange={(checked) => set('include_in_net_worth', checked)}
          label="يدخل في صافي الثروة"
          hint="اقفلها لحساب مش بتاعك فعليًّا (أمانة أو فلوس جمعية مثلًا)"
        />
      </form>
    </Modal>
  );
}

export default function AccountForm({ open, ...props }) {
  return open ? <AccountDialog {...props} /> : null;
}
