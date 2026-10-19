/**
 * نموذج العملية (إضافة/تعديل) — أكثر شاشة تُفتح في التطبيق، فالأولوية للسرعة:
 * المبلغ أول حقل وعليه التركيز، آخر حساب مستخدَم يُختار تلقائيًّا (على هذا
 * الجهاز)، و«حفظ وإضافة غيرها» يُبقي النوع والحساب والتصنيف والتاريخ.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { useForm } from '../../lib/forms.js';
import { useLocalStorage } from '../../lib/hooks.js';
import { todayIn } from '../../lib/period.js';
import { TX_TYPES } from '../../lib/constants.js';
import { categoryTree, useAccounts, useCategories, useRefreshMoney } from '../../lib/queries.js';
import {
  Button, Field, Input, Modal, MoneyInput, Notice, Segmented, Select, useConfirm,
} from '../ui/index.js';

const TONES = { expense: 'expense', income: 'income', transfer: 'transfer' };

function initialValues(transaction, defaults, today) {
  if (transaction) {
    return {
      type: transaction.type,
      amount_minor: transaction.amount_minor,
      account_id: String(transaction.account_id),
      to_account_id: transaction.to_account_id ? String(transaction.to_account_id) : '',
      category_id: transaction.category_id ? String(transaction.category_id) : '',
      occurred_on: transaction.occurred_on,
      payee: transaction.payee ?? '',
      note: transaction.note ?? '',
    };
  }
  return {
    type: defaults?.type ?? 'expense',
    amount_minor: null,
    account_id: defaults?.account_id ? String(defaults.account_id) : '',
    to_account_id: '',
    category_id: '',
    occurred_on: today,
    payee: '',
    note: '',
  };
}

function TransactionFormDialog({ onClose, transaction, defaults }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const refreshMoney = useRefreshMoney();
  const accounts = useAccounts();
  const categories = useCategories();
  const [lastAccount, setLastAccount] = useLocalStorage('masrofy.lastAccount', null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const currency = user.household.currency;
  const today = todayIn(user.household.timezone);
  const editing = Boolean(transaction);
  const readOnly = editing && !transaction.can_edit;
  const form = useForm(() => initialValues(transaction, defaults, today));
  const { values, set } = form;

  const recordable = useMemo(() => (accounts.data ?? []).filter((account) => account.can_record), [accounts.data]);

  // الحساب الافتراضي بعد وصول القائمة: آخر حساب استُخدم على هذا الجهاز، أو الأول
  useEffect(() => {
    if (values.account_id || recordable.length === 0) return;
    const remembered = recordable.find((account) => account.id === lastAccount);
    set('account_id', String((remembered ?? recordable[0]).id));
  }, [recordable, lastAccount, values.account_id, set]);

  const tree = useMemo(() => categoryTree(categories.data, values.type), [categories.data, values.type]);
  // تصنيف أُرشف بعد التسجيل لا يظهر في القائمة؛ نُبقيه اختيارًا كي لا يضيع
  const missingCategory = editing && transaction.category_id && values.category_id === String(transaction.category_id)
    && !categories.data?.some((category) => category.id === transaction.category_id);

  // تصنيفات المصروف غير الدخل، فتغيير النوع يمسح الاختيار
  function changeType(type) {
    if (type === values.type) return;
    set('type', type);
    set('category_id', '');
  }

  function payload() {
    const body = {
      type: values.type,
      amount_minor: values.amount_minor,
      account_id: Number(values.account_id) || undefined,
      occurred_on: values.occurred_on,
      payee: values.payee,
      note: values.note,
    };
    if (values.type === 'transfer') body.to_account_id = Number(values.to_account_id) || null;
    else body.category_id = Number(values.category_id) || null;
    return body;
  }

  async function save(again = false) {
    setMessage(null);
    if (!values.amount_minor) { form.setErrors({ amount_minor: 'اكتب المبلغ' }); return; }
    setBusy(again ? 'again' : 'save');
    try {
      if (editing) await api.patch(`/transactions/${transaction.id}`, payload());
      else await api.post('/transactions', payload());
      setLastAccount(Number(values.account_id));
      refreshMoney();
      toast.success(editing ? 'اتعدّلت العملية' : 'اتسجّلت العملية');
      if (again) {
        form.setValues((current) => ({ ...current, amount_minor: null, payee: '', note: '' }));
        document.getElementById('tx-amount')?.focus();
      } else {
        onClose();
      }
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const ok = await confirm({ title: 'حذف العملية؟', message: 'الرصيد هيرجع زي ما كان قبلها. مفيش تراجع.', danger: true, confirmLabel: 'حذف' });
    if (!ok) return;
    setBusy('delete');
    try {
      await api.del(`/transactions/${transaction.id}`);
      refreshMoney();
      toast.success('اتحذفت العملية');
      onClose();
    } catch (error) {
      setMessage(error.message);
      setBusy(null);
    }
  }

  const footer = readOnly ? <Button onClick={onClose}>إغلاق</Button> : (
    <>
      {editing && <Button variant="danger-ghost" icon="trash" onClick={remove} loading={busy === 'delete'} style={{ marginInlineEnd: 'auto' }}>حذف</Button>}
      {!editing && <Button onClick={() => save(true)} loading={busy === 'again'} disabled={Boolean(busy)}>حفظ وإضافة غيرها</Button>}
      <Button variant="primary" type="submit" form="tx-form" loading={busy === 'save'} disabled={Boolean(busy)}>{editing ? 'حفظ التعديل' : 'حفظ'}</Button>
    </>
  );

  const accountOptions = (exclude) => recordable
    .filter((account) => String(account.id) !== exclude)
    .map((account) => <option key={account.id} value={account.id}>{account.name}{account.is_shared ? '' : ' (خاص)'}</option>);

  return (
    <Modal open onClose={onClose} title={editing ? (readOnly ? 'تفاصيل العملية' : 'تعديل العملية') : 'عملية جديدة'} footer={footer}>
      <form id="tx-form" className="stack" noValidate onSubmit={(event) => { event.preventDefault(); save(false); }}>
        {readOnly && <Notice icon="lock">العملية دي على حساب مش من حقّك تسجّل عليه، فتقدر تشوفها بس.</Notice>}
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        {!readOnly && recordable.length === 0 && accounts.isSuccess && (
          <Notice tone="warning" icon="wallet">مفيش حساب تقدر تسجّل عليه — ضيف حساب الأول من صفحة الحسابات.</Notice>
        )}

        <fieldset disabled={readOnly} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <Segmented block label="نوع العملية" value={values.type} onChange={changeType} options={TX_TYPES.map((type) => ({ ...type, tone: TONES[type.value] }))} />

          <Field label="المبلغ" error={form.errors.amount_minor}>
            {(props) => <MoneyInput {...props} id="tx-amount" large data-autofocus value={values.amount_minor} onChange={(minor) => set('amount_minor', minor)} currency={currency} />}
          </Field>

          <div className="form-grid">
            <Field label={values.type === 'transfer' ? 'من حساب' : 'الحساب'} error={form.errors.account_id}>
              {(props) => (
                <Select {...props} value={values.account_id} onChange={form.on('account_id')}>
                  {readOnly && <option value={values.account_id}>{transaction.account_name}</option>}
                  {!values.account_id && <option value="">اختار…</option>}
                  {accountOptions(values.type === 'transfer' ? values.to_account_id : null)}
                </Select>
              )}
            </Field>

            {values.type === 'transfer' ? (
              <Field label="إلى حساب" error={form.errors.to_account_id}>
                {(props) => (
                  <Select {...props} value={values.to_account_id} onChange={form.on('to_account_id')}>
                    {readOnly && <option value={values.to_account_id}>{transaction.to_account_name}</option>}
                    <option value="">اختار…</option>
                    {accountOptions(values.account_id)}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label="التصنيف" error={form.errors.category_id}>
                {(props) => (
                  <Select {...props} value={values.category_id} onChange={form.on('category_id')} disabled={categories.isLoading}>
                    <option value="">اختار…</option>
                    {missingCategory && <option value={values.category_id}>{transaction.category_name} (مؤرشف)</option>}
                    {tree.map((parent) => (
                      <optgroup key={parent.id} label={`${parent.icon ?? ''} ${parent.name}`}>
                        <option value={parent.id}>{parent.name}{parent.children.length ? ' — عام' : ''}</option>
                        {parent.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            <Field label="التاريخ" error={form.errors.occurred_on}>
              {(props) => <Input {...props} type="date" value={values.occurred_on} onChange={form.on('occurred_on')} max="2100-12-31" />}
            </Field>

            <Field label={values.type === 'income' ? 'من مين؟' : values.type === 'transfer' ? 'الوصف' : 'فين / لمين؟'} error={form.errors.payee}>
              {(props) => <Input {...props} value={values.payee} onChange={form.on('payee')} maxLength={120} placeholder={values.type === 'expense' ? 'مثلًا: كارفور' : ''} />}
            </Field>

            <Field label="ملاحظة" error={form.errors.note} className="full">
              {(props) => <Input {...props} value={values.note} onChange={form.on('note')} maxLength={500} />}
            </Field>
          </div>
        </fieldset>
        {editing && transaction.created_by_name && <p className="xsmall faint">سجّلها: {transaction.created_by_name}</p>}
      </form>
    </Modal>
  );
}

/** يُركَّب فقط وهو مفتوح، فكل فتح يبدأ بحالة نظيفة */
export default function TransactionForm({ open, ...props }) {
  return open ? <TransactionFormDialog {...props} /> : null;
}
