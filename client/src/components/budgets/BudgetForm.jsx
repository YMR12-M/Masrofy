/** ميزانية شهرية لتصنيف مصروف: الحدّ + نسبة التنبيه */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { formatBps, formatMoney } from '../../lib/format.js';
import { useForm } from '../../lib/forms.js';
import { ALERT_LEVELS } from '../../lib/constants.js';
import { categoryTree, useCategories } from '../../lib/queries.js';
import {
  Button, Field, Modal, MoneyInput, Notice, Segmented, Select,
} from '../ui/index.js';

function BudgetDialog({ budget, usedCategoryIds, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const editing = Boolean(budget);
  const currency = user.household.currency;

  const form = useForm(() => ({
    category_id: budget ? String(budget.category_id) : '',
    amount_minor: budget?.amount_minor ?? null,
    alert_bps: budget?.alert_bps ?? 8000,
  }));
  const { values, set } = form;
  const tree = useMemo(() => categoryTree(categories.data, 'expense'), [categories.data]);
  const free = (id) => !usedCategoryIds.has(id);
  const freeCount = tree.reduce((count, parent) => count + (free(parent.id) ? 1 : 0) + parent.children.filter((child) => free(child.id)).length, 0);
  const allTaken = !editing && categories.isSuccess && freeCount === 0;

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    if (!editing && !values.category_id) errors.category_id = 'اختار التصنيف';
    if (!values.amount_minor) errors.amount_minor = 'اكتب الحدّ الشهري';
    if (Object.keys(errors).length) { form.setErrors(errors); return; }
    setBusy(true);
    setMessage(null);
    try {
      if (editing) {
        await api.patch(`/budgets/${budget.id}`, { amount_minor: values.amount_minor, alert_bps: values.alert_bps });
      } else {
        await api.post('/budgets', { category_id: Number(values.category_id), amount_minor: values.amount_minor, alert_bps: values.alert_bps });
      }
      await queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success(editing ? 'اتعدّلت الميزانية' : 'اتضافت الميزانية');
      onClose();
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  // تقريب لأقرب جنيه: الرقم للتقدير بس
  const perDay = values.amount_minor > 0 ? Math.max(100, Math.round(values.amount_minor / 30 / 100) * 100) : null;
  const alertAt = values.amount_minor > 0 ? Math.round((values.amount_minor * values.alert_bps) / 10_000) : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="narrow"
      title={editing ? `ميزانية ${budget.category_name}` : 'ميزانية جديدة'}
      footer={(
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" type="submit" form="budget-form" loading={busy} disabled={allTaken}>{editing ? 'حفظ' : 'إضافة'}</Button>
        </>
      )}
    >
      <form id="budget-form" className="stack" noValidate onSubmit={submit}>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        {allTaken && <Notice tone="info" icon="target">كل تصنيفات المصروف عليها ميزانية خلاص. عدّل واحدة موجودة، أو ضيف تصنيف جديد الأول.</Notice>}
        {!editing && (
          <Field label="التصنيف" hint="ميزانية التصنيف الرئيسي بتشمل كل فروعه" error={form.errors.category_id} required>
            {(props) => (
              <Select {...props} data-autofocus value={values.category_id} onChange={form.on('category_id')} disabled={categories.isLoading || allTaken}>
                <option value="">{categories.isLoading ? 'بنحمّل التصنيفات…' : 'اختار…'}</option>
                {tree.map((parent) => (
                  <optgroup key={parent.id} label={`${parent.icon ?? ''} ${parent.name}`}>
                    {free(parent.id) && <option value={parent.id}>{parent.name}{parent.children.length ? ' (كله)' : ''}</option>}
                    {parent.children.filter((child) => free(child.id)).map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field
          label="الحدّ الشهري"
          hint={perDay ? <>يعني حوالي <span className="num">{formatMoney(perDay, currency, { compact: true })}</span> في اليوم</> : 'أقصى مبلغ عايز تصرفه على البند ده في الشهر'}
          error={form.errors.amount_minor}
          required
        >
          {(props) => <MoneyInput {...props} large data-autofocus={editing || undefined} value={values.amount_minor} onChange={(minor) => set('amount_minor', minor)} currency={currency} />}
        </Field>
        <Field
          label="نبّهني لما أوصل"
          hint={alertAt
            ? <>لما المصروف يعدّي <span className="num">{formatMoney(alertAt, currency, { compact: true })}</span> الميزانية هتقلب «قرّبت من الحدّ».</>
            : <>الميزانية بتقلب «قرّبت من الحدّ» عند <span className="num">{formatBps(values.alert_bps)}</span> منها.</>}
          error={form.errors.alert_bps}
        >
          {() => <Segmented block label="حدّ التنبيه" value={values.alert_bps} onChange={(bps) => set('alert_bps', bps)} options={ALERT_LEVELS} />}
        </Field>
      </form>
    </Modal>
  );
}

export default function BudgetForm({ open, ...props }) {
  return open ? <BudgetDialog {...props} /> : null;
}
