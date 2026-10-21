/**
 * فاتورة متكرّرة (أو دخل متكرّر): قالب عملية + معاد يتكرّر.
 * أول معاد يحدّد اليوم: الشهري يوم 31 يقع آخر الشهر في الشهور الأقصر.
 * «تلقائي» يسجّلها لوحدها في معادها، وإلا تفضل تذكيرًا بزرار «دفعت».
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { describeSchedule, FREQUENCIES } from '../../lib/bills.js';
import { formatDayMonth } from '../../lib/format.js';
import { useForm } from '../../lib/forms.js';
import { todayIn } from '../../lib/period.js';
import { TX_TYPES } from '../../lib/constants.js';
import { Icon } from '../../lib/icons.jsx';
import { categoryTree, useAccounts, useCategories } from '../../lib/queries.js';
import {
  Badge, Button, Field, Input, Modal, MoneyInput, Notice, Segmented, Select, Switch, useConfirm,
} from '../ui/index.js';

const TONES = { expense: 'expense', income: 'income', transfer: 'transfer' };
const ENDINGS = [
  { value: 'never', label: 'مستمرّة' },
  { value: 'date', label: 'لحد تاريخ' },
  { value: 'count', label: 'عدد مرات' },
];
const EVERY_UNIT = { weekly: 'أسبوع', monthly: 'شهر', yearly: 'سنة' };

function initialValues(rule, today) {
  if (rule) {
    return {
      name: rule.name,
      type: rule.type,
      amount_minor: rule.amount_minor,
      account_id: String(rule.account_id),
      to_account_id: rule.to_account_id ? String(rule.to_account_id) : '',
      category_id: rule.category_id ? String(rule.category_id) : '',
      frequency: rule.frequency,
      interval_count: String(rule.interval_count),
      start_on: rule.start_on,
      ending: rule.end_on ? 'date' : rule.total_count ? 'count' : 'never',
      end_on: rule.end_on ?? '',
      total_count: rule.total_count ? String(rule.total_count) : '',
      payee: rule.payee ?? '',
      note: rule.note ?? '',
      auto_post: rule.auto_post,
    };
  }
  return {
    name: '', type: 'expense', amount_minor: null, account_id: '', to_account_id: '', category_id: '',
    frequency: 'monthly', interval_count: '1', start_on: today, ending: 'never', end_on: '', total_count: '',
    payee: '', note: '', auto_post: false,
  };
}

/** مجموعة حقول بعنوان (التكرار، النهاية): العنوان بنفس شكل تسمية الحقل */
function Group({ label, children }) {
  const id = useId();
  return (
    <div className="stack sm" role="group" aria-labelledby={id}>
      <span id={id} className="group-label">{label}</span>
      {children}
    </div>
  );
}

function History({ ruleId }) {
  const detail = useQuery({ queryKey: ['bills', 'recurring', ruleId], queryFn: () => api.get(`/recurring/${ruleId}`) });
  const history = detail.data?.history ?? [];
  if (history.length === 0) return null;
  return (
    <Group label="آخر مرات">
      <div className="row wrap" style={{ gap: 6 }}>
        {history.map((entry) => (
          <Badge key={entry.due_on} tone={entry.status === 'posted' ? 'income' : ''}>
            <Icon name={entry.status === 'posted' ? 'check' : 'arrow-left'} size={12} />
            {formatDayMonth(entry.due_on)}
            <span className="visually-hidden">{entry.status === 'posted' ? 'اتسجّلت' : 'اتخطّت'}</span>
          </Badge>
        ))}
      </div>
    </Group>
  );
}

function RecurringDialog({ rule, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const categories = useCategories();
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const today = todayIn(user.household.timezone);
  const editing = Boolean(rule);
  const readOnly = editing && !rule.can_edit;
  const form = useForm(() => initialValues(rule, today));
  const { values, set } = form;

  const recordable = useMemo(() => (accounts.data ?? []).filter((account) => account.can_record), [accounts.data]);
  const tree = useMemo(() => categoryTree(categories.data, values.type), [categories.data, values.type]);
  const interval = Number(values.interval_count) || 1;

  // فاتورة جديدة: أول حساب يقدر يسجّل عليه بدل خانة فاضية
  useEffect(() => {
    if (!editing && !values.account_id && recordable.length > 0) set('account_id', String(recordable[0].id));
  }, [editing, recordable, values.account_id, set]);

  function changeType(type) {
    if (type === values.type) return;
    set('type', type);
    set('category_id', '');
  }

  function payload() {
    const body = {
      name: values.name,
      type: values.type,
      amount_minor: values.amount_minor,
      account_id: Number(values.account_id) || undefined,
      frequency: values.frequency,
      interval_count: interval,
      start_on: values.start_on,
      end_on: values.ending === 'date' ? values.end_on : null,
      total_count: values.ending === 'count' ? Number(values.total_count) : null,
      payee: values.payee,
      note: values.note,
      auto_post: values.auto_post,
    };
    if (values.type === 'transfer') { body.to_account_id = Number(values.to_account_id) || null; body.category_id = null; }
    else { body.category_id = Number(values.category_id) || null; body.to_account_id = null; }
    return body;
  }

  async function save(event) {
    event.preventDefault();
    setMessage(null);
    const errors = {};
    if (!values.name.trim()) errors.name = 'اكتب اسم للفاتورة';
    if (!values.amount_minor) errors.amount_minor = 'اكتب المبلغ';
    if (Object.keys(errors).length) { form.setErrors(errors); return; }
    if (values.ending === 'date' && !values.end_on) { form.setErrors({ end_on: 'اختار آخر معاد' }); return; }
    if (values.ending === 'count' && !(Number(values.total_count) >= 1)) { form.setErrors({ total_count: 'اكتب عدد المرات' }); return; }
    setBusy('save');
    try {
      if (editing) await api.patch(`/recurring/${rule.id}`, payload());
      else await api.post('/recurring', payload());
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success(editing ? 'اتعدّلت الفاتورة' : 'اتضافت الفاتورة');
      onClose();
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `حذف «${rule.name}»؟`,
      message: 'مواعيدها الجاية هتختفي. العمليات اللي اتسجّلت منها قبل كده هتفضل زي ما هي.',
      danger: true,
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api.del(`/recurring/${rule.id}`);
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success('اتحذفت الفاتورة');
      onClose();
    } catch (error) {
      setMessage(error.message);
      setBusy(null);
    }
  }

  const accountOptions = (exclude) => recordable
    .filter((account) => String(account.id) !== exclude)
    .map((account) => <option key={account.id} value={account.id}>{account.name}{account.is_shared ? '' : ' (خاص)'}</option>);

  const footer = readOnly ? <Button onClick={onClose}>إغلاق</Button> : (
    <>
      {editing && <Button variant="danger-ghost" icon="trash" onClick={remove} loading={busy === 'delete'} style={{ marginInlineEnd: 'auto' }}>حذف</Button>}
      <Button onClick={onClose}>إلغاء</Button>
      <Button variant="primary" type="submit" form="recurring-form" loading={busy === 'save'} disabled={Boolean(busy)}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
    </>
  );

  const preview = values.start_on ? describeSchedule({ frequency: values.frequency, interval_count: interval, start_on: values.start_on }) : null;
  const clampsAtMonthEnd = values.frequency !== 'weekly' && Number(values.start_on?.slice(8, 10)) > 28;

  return (
    <Modal open onClose={onClose} title={editing ? (readOnly ? rule.name : 'تعديل الفاتورة') : 'فاتورة متكرّرة جديدة'} footer={footer}>
      <form id="recurring-form" className="stack" noValidate onSubmit={save}>
        {readOnly && <Notice icon="lock">الفاتورة دي على حساب مش من حقّك تسجّل عليه، فتقدر تشوفها بس.</Notice>}
        {rule?.problem && !readOnly && (
          <Notice tone="warning" icon="alert">
            {rule.problem === 'account_archived' ? 'الحساب بتاعها اتأرشف. اختار حساب تاني عشان تقدر تسجّلها.' : 'التصنيف بتاعها اتأرشف. اختار تصنيف تاني.'}
          </Notice>
        )}
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        {!readOnly && accounts.isSuccess && recordable.length === 0 && (
          <Notice tone="warning" icon="wallet">مفيش حساب تقدر تسجّل عليه. ضيف حساب الأول من صفحة الحسابات.</Notice>
        )}

        <fieldset disabled={readOnly} className="stack bare-fieldset">
          <Field label="الاسم" error={form.errors.name} required>
            {(props) => <Input {...props} data-autofocus value={values.name} onChange={form.on('name')} maxLength={80} placeholder="مثلًا: إيجار الشقة، النت، نتفليكس، المرتب" />}
          </Field>

          <Segmented block label="النوع" value={values.type} onChange={changeType} options={TX_TYPES.map((type) => ({ ...type, tone: TONES[type.value] }))} />

          <Field label="المبلغ" error={form.errors.amount_minor} hint="لو بيتغيّر (زي الكهربا) اكتب المتوسط، وعدّله وقت ما تدفع">
            {(props) => <MoneyInput {...props} value={values.amount_minor} onChange={(minor) => set('amount_minor', minor)} currency={user.household.currency} />}
          </Field>

          <div className="form-grid">
            <Field label={values.type === 'transfer' ? 'من حساب' : values.type === 'income' ? 'في حساب' : 'من حساب'} error={form.errors.account_id}>
              {(props) => (
                <Select {...props} value={values.account_id} onChange={form.on('account_id')} disabled={accounts.isLoading}>
                  <option value="">{accounts.isLoading ? 'بنحمّل الحسابات…' : 'اختار…'}</option>
                  {readOnly && <option value={values.account_id}>{rule.account_name}</option>}
                  {editing && !readOnly && !recordable.some((account) => String(account.id) === values.account_id) && (
                    <option value={values.account_id}>{rule.account_name} (مؤرشف)</option>
                  )}
                  {accountOptions(values.type === 'transfer' ? values.to_account_id : null)}
                </Select>
              )}
            </Field>

            {values.type === 'transfer' ? (
              <Field label="إلى حساب" error={form.errors.to_account_id}>
                {(props) => (
                  <Select {...props} value={values.to_account_id} onChange={form.on('to_account_id')}>
                    <option value="">اختار…</option>
                    {readOnly && <option value={values.to_account_id}>{rule.to_account_name}</option>}
                    {accountOptions(values.account_id)}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label="التصنيف" error={form.errors.category_id}>
                {(props) => (
                  <Select {...props} value={values.category_id} onChange={form.on('category_id')} disabled={categories.isLoading}>
                    <option value="">اختار…</option>
                    {editing && rule.category_id && values.category_id === String(rule.category_id)
                      && !categories.data?.some((category) => category.id === rule.category_id)
                      && <option value={values.category_id}>{rule.category_name} (مؤرشف)</option>}
                    {tree.map((parent) => (
                      <optgroup key={parent.id} label={`${parent.icon ?? ''} ${parent.name}`}>
                        <option value={parent.id}>{parent.name}{parent.children.length ? ' (عام)' : ''}</option>
                        {parent.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
                      </optgroup>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>

          <Group label="بتتكرّر">
            <Segmented block label="التكرار" value={values.frequency} onChange={(frequency) => set('frequency', frequency)} options={FREQUENCIES} />
            <div className="form-grid">
              <Field label={`كل كام ${EVERY_UNIT[values.frequency]}؟`} error={form.errors.interval_count}>
                {(props) => <Input {...props} type="number" inputMode="numeric" min={1} max={52} className="ltr-input num" value={values.interval_count} onChange={form.on('interval_count')} />}
              </Field>
              <Field label="أول معاد" error={form.errors.start_on}>
                {(props) => <Input {...props} type="date" value={values.start_on} onChange={form.on('start_on')} max="2100-12-31" />}
              </Field>
            </div>
            {preview && (
              <p className="xsmall muted row" style={{ gap: 6 }}>
                <Icon name="calendar" size={14} />
                <span>{preview}{clampsAtMonthEnd && '، ولو الشهر أقصر يبقى آخر يوم فيه'}</span>
              </p>
            )}
          </Group>

          <Group label="لحد إمتى؟">
            <Segmented block label="النهاية" value={values.ending} onChange={(ending) => set('ending', ending)} options={ENDINGS} />
            {values.ending === 'date' && (
              <Field label="آخر معاد يوم" error={form.errors.end_on}>
                {(props) => <Input {...props} type="date" value={values.end_on} onChange={form.on('end_on')} min={values.start_on} max="2100-12-31" />}
              </Field>
            )}
            {values.ending === 'count' && (
              <Field label="كام مرة؟" hint="من أول معاد" error={form.errors.total_count}>
                {(props) => <Input {...props} type="number" inputMode="numeric" min={1} max={1000} className="ltr-input num" value={values.total_count} onChange={form.on('total_count')} />}
              </Field>
            )}
          </Group>

          <div className="form-grid">
            <Field label={values.type === 'income' ? 'من مين؟' : 'لمين؟'} error={form.errors.payee}>
              {(props) => <Input {...props} value={values.payee} onChange={form.on('payee')} maxLength={120} placeholder={values.type === 'expense' ? 'مثلًا: WE، صاحب الشقة' : ''} />}
            </Field>
            <Field label="ملاحظة" error={form.errors.note}>
              {(props) => <Input {...props} value={values.note} onChange={form.on('note')} maxLength={500} />}
            </Field>
          </div>

          <Switch
            checked={values.auto_post}
            onChange={(checked) => set('auto_post', checked)}
            label="سجّلها لوحدها في معادها"
            hint="من غير ما تدوس «دفعت». مناسبة للخصم التلقائي من البنك والمرتب"
          />
        </fieldset>

        {editing && <History ruleId={rule.id} />}
      </form>
    </Modal>
  );
}

/** يُركَّب فقط وهو مفتوح، فكل فتح يبدأ بحالة نظيفة */
export default function RecurringForm({ open, ...props }) {
  return open ? <RecurringDialog {...props} /> : null;
}
