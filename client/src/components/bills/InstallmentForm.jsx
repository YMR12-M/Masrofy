/**
 * خطّة تقسيط: الإجمالي + المقدّم + عدد الأقساط الشهرية + أول قسط.
 * المعاينة تحت الحقول بنفس قسمة السيرفر بالقرش (الأخير ياخد الباقي).
 * بعد أول سداد يتقفل المبلغ والمواعيد — الاسم والحساب والتصنيف يفضلوا يتعدّلوا.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { addMonthsClamped, installmentsText, splitInstallments } from '../../lib/bills.js';
import { formatDate, formatMoney } from '../../lib/format.js';
import { useForm } from '../../lib/forms.js';
import { todayIn } from '../../lib/period.js';
import { categoryTree, useAccounts, useCategories } from '../../lib/queries.js';
import {
  Button, Field, Input, Modal, MoneyFigure, MoneyInput, Notice, Select,
} from '../ui/index.js';

/** التصنيف المقترح من التصنيفات الافتراضية للأسرة */
const SUGGESTED_CATEGORY = 'أقساط وديون';

function initialValues(plan, today) {
  if (plan) {
    return {
      name: plan.name,
      payee: plan.payee ?? '',
      total_minor: plan.total_minor,
      down_payment_minor: plan.down_payment_minor || null,
      installment_count: String(plan.installment_count),
      first_due_on: plan.first_due_on,
      purchase_on: plan.purchase_on,
      account_id: String(plan.account_id),
      category_id: String(plan.category_id),
      note: plan.note ?? '',
    };
  }
  return {
    name: '', payee: '', total_minor: null, down_payment_minor: null, installment_count: '12',
    first_due_on: addMonthsClamped(today, 1), purchase_on: today, account_id: '', category_id: '', note: '',
  };
}

function InstallmentDialog({ plan, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const categories = useCategories();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const currency = user.household.currency;
  const today = todayIn(user.household.timezone);
  const editing = Boolean(plan);
  const locked = editing && plan.paid_minor > 0;

  const form = useForm(() => initialValues(plan, today));
  const { values, set } = form;
  const recordable = useMemo(() => (accounts.data ?? []).filter((account) => account.can_record), [accounts.data]);
  const tree = useMemo(() => categoryTree(categories.data, 'expense'), [categories.data]);

  // خطّة جديدة: أول حساب متاح، وتصنيف «أقساط وديون» لو موجود
  useEffect(() => {
    if (!editing && !values.account_id && recordable.length > 0) set('account_id', String(recordable[0].id));
  }, [editing, recordable, values.account_id, set]);
  useEffect(() => {
    if (editing || values.category_id || !categories.data) return;
    const suggested = categories.data.find((category) => category.kind === 'expense' && category.name === SUGGESTED_CATEGORY);
    if (suggested) set('category_id', String(suggested.id));
  }, [editing, categories.data, values.category_id, set]);

  const count = Number(values.installment_count) || 0;
  const down = values.down_payment_minor ?? 0;
  const split = splitInstallments(values.total_minor, down, count);

  async function submit(event) {
    event.preventDefault();
    setMessage(null);
    const errors = {};
    if (!values.name.trim()) errors.name = 'اكتب اشتريت إيه';
    if (!values.total_minor) errors.total_minor = 'اكتب الإجمالي';
    else if (!locked && !split) errors.installment_count = down >= values.total_minor ? 'المقدّم أكبر من الإجمالي' : 'عدد الأقساط مش مظبوط';
    if (Object.keys(errors).length) { form.setErrors(errors); return; }
    setBusy(true);
    const body = {
      name: values.name,
      payee: values.payee,
      note: values.note,
      account_id: Number(values.account_id) || undefined,
      category_id: Number(values.category_id) || undefined,
    };
    if (!locked) {
      Object.assign(body, {
        total_minor: values.total_minor,
        down_payment_minor: down,
        installment_count: count,
        first_due_on: values.first_due_on,
        // من غير مقدّم يوم الشراء مش فارق: نخليه أول قسط لو جاي قبل النهارده
        purchase_on: down > 0 ? values.purchase_on : (values.first_due_on < values.purchase_on ? values.first_due_on : values.purchase_on),
      });
    }
    try {
      if (editing) await api.patch(`/installments/${plan.id}`, body);
      else await api.post('/installments', body);
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success(editing ? 'اتعدّلت الخطّة' : 'اتضافت خطّة التقسيط');
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
      title={editing ? `تعديل «${plan.name}»` : 'تقسيط جديد'}
      footer={(
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" type="submit" form="installment-form" loading={busy}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
        </>
      )}
    >
      <form id="installment-form" className="stack" noValidate onSubmit={submit}>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        {accounts.isSuccess && recordable.length === 0 && (
          <Notice tone="warning" icon="wallet">مفيش حساب تقدر تسجّل عليه. ضيف حساب الأول من صفحة الحسابات.</Notice>
        )}
        {locked && <Notice icon="lock">فيه أقساط اتدفعت، فالمبلغ والمواعيد متقفلين. لو محتاج تغيّرهم احذف الخطّة واعملها من جديد.</Notice>}

        <div className="form-grid">
          <Field label="اشتريت إيه؟" error={form.errors.name} required>
            {(props) => <Input {...props} data-autofocus value={values.name} onChange={form.on('name')} maxLength={80} placeholder="مثلًا: تلاجة، موبايل" />}
          </Field>
          <Field label="من فين؟" error={form.errors.payee}>
            {(props) => <Input {...props} value={values.payee} onChange={form.on('payee')} maxLength={120} placeholder="مثلًا: بي تك، valU" />}
          </Field>
        </div>

        <fieldset disabled={locked} className="stack bare-fieldset">
          <div className="form-grid">
            <Field label="الإجمالي" hint="اللي هتدفعه كله بالفوايد" error={form.errors.total_minor} required>
              {(props) => <MoneyInput {...props} value={values.total_minor} onChange={(minor) => set('total_minor', minor)} currency={currency} />}
            </Field>
            <Field label="المقدّم" error={form.errors.down_payment_minor}>
              {(props) => <MoneyInput {...props} value={values.down_payment_minor} onChange={(minor) => set('down_payment_minor', minor)} currency={currency} placeholder="0" />}
            </Field>
            <Field label="عدد الأقساط" error={form.errors.installment_count}>
              {(props) => <Input {...props} type="number" inputMode="numeric" min={1} max={120} className="ltr-input num" value={values.installment_count} onChange={form.on('installment_count')} />}
            </Field>
            <Field label="أول قسط يوم" error={form.errors.first_due_on}>
              {(props) => <Input {...props} type="date" value={values.first_due_on} onChange={form.on('first_due_on')} max="2100-12-31" />}
            </Field>
            {down > 0 && (
              <Field label="يوم الشراء (معاد المقدّم)" error={form.errors.purchase_on}>
                {(props) => <Input {...props} type="date" value={values.purchase_on} onChange={form.on('purchase_on')} max={values.first_due_on} />}
              </Field>
            )}
          </div>
        </fieldset>

        {split ? (
          <div className="figure-panel" aria-live="polite">
            <div>
              <span className="label">القسط الشهري</span>
              <MoneyFigure minor={split.base} currency={currency} size="md" compact />
            </div>
            <div className="side">
              <span><b>{installmentsText(count)}</b>{down > 0 && <> بعد مقدّم <b className="num">{formatMoney(down, currency)}</b></>}</span>
              {split.base !== split.last && <span>والأخير <b className="num">{formatMoney(split.last, currency)}</b></span>}
              {values.first_due_on && <span>آخر قسط {formatDate(addMonthsClamped(values.first_due_on, count - 1))}</span>}
            </div>
          </div>
        ) : !locked && (
          <p className="xsmall muted">اكتب الإجمالي وعدد الأقساط، وهنحسب لك القسط الشهري وآخر معاد.</p>
        )}

        <div className="form-grid">
          <Field label="بتدفع من" error={form.errors.account_id}>
            {(props) => (
              <Select {...props} value={values.account_id} onChange={form.on('account_id')}>
                <option value="">اختار…</option>
                {editing && !recordable.some((account) => String(account.id) === values.account_id) && <option value={values.account_id}>{plan.account_name} (مؤرشف)</option>}
                {recordable.map((account) => <option key={account.id} value={account.id}>{account.name}{account.is_shared ? '' : ' (خاص)'}</option>)}
              </Select>
            )}
          </Field>
          <Field label="التصنيف" error={form.errors.category_id}>
            {(props) => (
              <Select {...props} value={values.category_id} onChange={form.on('category_id')} disabled={categories.isLoading}>
                <option value="">اختار…</option>
                {editing && !categories.data?.some((category) => String(category.id) === values.category_id) && <option value={values.category_id}>{plan.category_name} (مؤرشف)</option>}
                {tree.map((parent) => (
                  <optgroup key={parent.id} label={`${parent.icon ?? ''} ${parent.name}`}>
                    <option value={parent.id}>{parent.name}{parent.children.length ? ' (عام)' : ''}</option>
                    {parent.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          <Field label="ملاحظة" error={form.errors.note} className="full">
            {(props) => <Input {...props} value={values.note} onChange={form.on('note')} maxLength={500} />}
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export default function InstallmentForm({ open, ...props }) {
  return open ? <InstallmentDialog {...props} /> : null;
}
