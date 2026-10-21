/** إضافة تصنيف (رئيسي أو فرعي) أو تعديله */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { useForm } from '../../lib/forms.js';
import {
  Button, CategoryIcon, ColorPicker, EmojiPicker, Field, Input, Modal, Notice, Select,
} from '../ui/index.js';

function CategoryDialog({ category, kind, parentId, parents, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const editing = Boolean(category);
  const hasChildren = editing && parents.some((parent) => parent.id === category.id && parent.children.length > 0);

  const form = useForm(() => ({
    name: category?.name ?? '',
    parent_id: String(category?.parent_id ?? parentId ?? ''),
    icon: category?.icon ?? null,
    color: category?.color ?? '#0369a1',
  }));
  const { values, set } = form;
  const isChild = values.parent_id !== '';
  const parent = parents.find((entry) => String(entry.id) === values.parent_id);
  const kindLabel = kind === 'income' ? 'دخل' : 'مصروف';

  async function submit(event) {
    event.preventDefault();
    if (!values.name.trim()) { form.setErrors({ name: 'اكتب اسم التصنيف' }); return; }
    setBusy(true);
    setMessage(null);
    const body = {
      name: values.name,
      parent_id: values.parent_id ? Number(values.parent_id) : null,
      icon: isChild ? null : values.icon,
      color: values.color,
    };
    try {
      if (editing) await api.patch(`/categories/${category.id}`, body);
      else await api.post('/categories', { ...body, kind });
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(editing ? 'اتعدّل التصنيف' : 'اتضاف التصنيف');
      onClose();
    } catch (error) {
      setMessage(form.fail(error));
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? 'تعديل التصنيف' : isChild && parent ? `فرع جديد تحت «${parent.name}»` : `تصنيف ${kindLabel} جديد`;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={(
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" type="submit" form="category-form" loading={busy}>{editing ? 'حفظ' : 'إضافة'}</Button>
        </>
      )}
    >
      <form id="category-form" className="stack" noValidate onSubmit={submit}>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}

        <div className="form-preview" aria-hidden="true">
          <CategoryIcon icon={isChild ? parent?.icon : values.icon} color={values.color} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="title truncate">{values.name.trim() || 'اسم التصنيف'}</div>
            <div className="meta truncate">{isChild && parent ? `فرع من ${parent.name}` : `تصنيف ${kindLabel} رئيسي`}</div>
          </div>
        </div>

        <Field label="الاسم" error={form.errors.name} required>
          {(props) => <Input {...props} data-autofocus value={values.name} onChange={form.on('name')} maxLength={60} placeholder={kind === 'income' ? 'مثلًا: مرتب' : 'مثلًا: مواصلات'} />}
        </Field>
        <Field label="تحت تصنيف" hint={hasChildren ? 'التصنيف ده له فروع، فلازم يفضل رئيسي' : 'سيبه «رئيسي» لو مش فرع من حاجة'} error={form.errors.parent_id}>
          {(props) => (
            <Select {...props} value={values.parent_id} onChange={form.on('parent_id')} disabled={hasChildren}>
              <option value="">رئيسي</option>
              {parents.filter((entry) => entry.id !== category?.id).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.icon} {entry.name}</option>
              ))}
            </Select>
          )}
        </Field>
        {isChild
          ? <p className="xsmall muted">الفروع بتاخد أيقونة التصنيف الرئيسي، وتقدر تختار لها لون.</p>
          : <Field label="الأيقونة">{() => <EmojiPicker value={values.icon} onChange={(icon) => set('icon', icon)} />}</Field>}
        <Field label="اللون">
          {() => <ColorPicker value={values.color} onChange={(color) => set('color', color)} />}
        </Field>
      </form>
    </Modal>
  );
}

export default function CategoryForm({ open, ...props }) {
  return open ? <CategoryDialog {...props} /> : null;
}
