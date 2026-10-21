/**
 * «دفعت بتفاصيل تانية»: نفس تسجيل المعاد لكن بمبلغ أو تاريخ أو حساب مختلف
 * للمرة دي (فاتورة كهربا متغيّرة، دفع من حساب تاني…). القالب نفسه لا يتغيّر.
 * مبلغ القسط ثابت من جدول التقسيط.
 */
import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useForm } from '../../lib/forms.js';
import { formatDate } from '../../lib/format.js';
import { Icon } from '../../lib/icons.jsx';
import { installmentLabel, postVerb } from '../../lib/bills.js';
import { todayIn } from '../../lib/period.js';
import { useAccounts } from '../../lib/queries.js';
import {
  Button, Field, Input, Modal, MoneyFigure, MoneyInput, Notice, Select,
} from '../ui/index.js';

function PostDialogInner({ item, onPost, onClose }) {
  const { user } = useAuth();
  const accounts = useAccounts();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const installment = item.source === 'installment';
  const form = useForm(() => ({
    amount_minor: item.amount_minor,
    occurred_on: todayIn(user.household.timezone),
    account_id: String(item.account_id),
    note: '',
  }));
  const { values, set } = form;

  // الحسابات اللي يقدر يسجّل عليها (ومن غير وجهة التحويل نفسها)
  const recordable = useMemo(
    () => (accounts.data ?? []).filter((account) => account.can_record && account.id !== item.to_account_id),
    [accounts.data, item.to_account_id],
  );

  async function submit(event) {
    event.preventDefault();
    if (!values.amount_minor) { form.setErrors({ amount_minor: 'اكتب المبلغ' }); return; }
    setBusy(true);
    setMessage(null);
    try {
      const overrides = { occurred_on: values.occurred_on, account_id: Number(values.account_id) || undefined };
      if (!installment) overrides.amount_minor = values.amount_minor;
      if (values.note.trim()) overrides.note = values.note;
      await onPost(item, overrides, { inline: true });
      onClose();
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  const verb = postVerb(item.type);
  return (
    <Modal
      open
      onClose={onClose}
      size="narrow"
      title={`${verb}: ${item.name}`}
      footer={(
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" type="submit" form="post-form" loading={busy}>{verb}</Button>
        </>
      )}
    >
      <form id="post-form" className="stack" noValidate onSubmit={submit}>
        <p className="muted small row" style={{ gap: 6 }}>
          <Icon name="calendar" size={16} />
          <span>{installment ? `${installmentLabel(item.installment)}، معاده` : 'معادها'} {formatDate(item.due_on)}</span>
        </p>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        {installment ? (
          <div className="figure-panel">
            <div>
              <span className="label">مبلغ القسط</span>
              <MoneyFigure minor={values.amount_minor} currency={user.household.currency} size="md" compact />
            </div>
            <span className="side">ثابت من جدول التقسيط</span>
          </div>
        ) : (
          <Field label="المبلغ" error={form.errors.amount_minor} hint="للمرة دي بس، الفاتورة نفسها مش هتتغيّر">
            {(props) => (
              <MoneyInput
                {...props}
                large
                data-autofocus
                value={values.amount_minor}
                onChange={(minor) => set('amount_minor', minor)}
                currency={user.household.currency}
              />
            )}
          </Field>
        )}
        <div className="form-grid">
          <Field label="التاريخ" error={form.errors.occurred_on}>
            {(props) => <Input {...props} type="date" value={values.occurred_on} onChange={form.on('occurred_on')} max="2100-12-31" data-autofocus={installment || undefined} />}
          </Field>
          <Field label={item.type === 'income' ? 'اتقبض في' : 'من حساب'} error={form.errors.account_id}>
            {(props) => (
              <Select {...props} value={values.account_id} onChange={form.on('account_id')}>
                {!recordable.some((account) => String(account.id) === values.account_id) && <option value={values.account_id}>{item.account_name}</option>}
                {recordable.map((account) => <option key={account.id} value={account.id}>{account.name}{account.is_shared ? '' : ' (خاص)'}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="ملاحظة" error={form.errors.note}>
          {(props) => <Input {...props} value={values.note} onChange={form.on('note')} maxLength={500} />}
        </Field>
      </form>
    </Modal>
  );
}

export default function PostDialog({ item, ...props }) {
  return item ? <PostDialogInner item={item} {...props} /> : null;
}
