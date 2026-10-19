/** ميزانية شهرية لتصنيف مصروف: الحدّ + نسبة التنبيه */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
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

  const form = useForm(() => ({
    category_id: budget ? String(budget.category_id) : '',
    amount_minor: budget?.amount_minor ?? null,
    alert_bps: budget?.alert_bps ?? 8000,
  }));
  const { values, set } = form;
  const tree = useMemo(() => categoryTree(categories.data, 'expense'), [categories.data]);
  const free = (id) => !usedCategoryIds.has(id);

  async function submit(event) {
    event.preventDefault();
    if (!values.amount_minor) { form.setErrors({ amount_minor: 'اكتب الحدّ الشهري' }); return; }
    setBusy(true);
    setMessage(null);
    try {
      if (editing) {
        await api.patch(`/budgets/${budget.id}`, { amount_minor: values.amount_minor, alert_bps: values.alert_bps });
      } else {
        await api.post('/budgets', { category_id: Number(values.category_id) || undefined, amount_minor: values.amount_minor, alert_bps: values.alert_bps });
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

  return (
    <Modal
      open
      onClose={onClose}
      size="narrow"
      title={editing ? `ميزانية ${budget.category_name}` : 'ميزانية جديدة'}
      footer={(
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" type="submit" form="budget-form" loading={busy}>{editing ? 'حفظ' : 'إضافة'}</Button>
        </>
      )}
    >
      <form id="budget-form" className="stack" noValidate onSubmit={submit}>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        {!editing && (
          <Field label="التصنيف" hint="ميزانية التصنيف الرئيسي بتشمل كل فروعه" error={form.errors.category_id} required>
            {(props) => (
              <Select {...props} data-autofocus value={values.category_id} onChange={form.on('category_id')}>
                <option value="">اختار…</option>
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
        <Field label="الحدّ الشهري" error={form.errors.amount_minor} required>
          {(props) => <MoneyInput {...props} data-autofocus={editing || undefined} value={values.amount_minor} onChange={(minor) => set('amount_minor', minor)} currency={user.household.currency} />}
        </Field>
        <Field label="نبّهني لما أوصل" error={form.errors.alert_bps}>
          {() => <Segmented block label="حدّ التنبيه" value={values.alert_bps} onChange={(bps) => set('alert_bps', bps)} options={ALERT_LEVELS} />}
        </Field>
      </form>
    </Modal>
  );
}

export default function BudgetForm({ open, ...props }) {
  return open ? <BudgetDialog {...props} /> : null;
}
