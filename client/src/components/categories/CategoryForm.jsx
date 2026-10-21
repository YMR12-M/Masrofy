/** إضافة تصنيف (رئيسي أو فرعي) أو تعديله */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { useForm } from '../../lib/forms.js';
import {
  Button, ColorPicker, EmojiPicker, Field, Input, Modal, Notice, Select,
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
    color: category?.color ?? '#0d6b57',
  }));
  const { values, set } = form;
  const isChild = values.parent_id !== '';

  async function submit(event) {
    event.preventDefault();
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

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'تعديل التصنيف' : kind === 'income' ? 'تصنيف دخل جديد' : 'تصنيف مصروف جديد'}
      footer={(
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" type="submit" form="category-form" loading={busy}>{editing ? 'حفظ' : 'إضافة'}</Button>
        </>
      )}
    >
      <form id="category-form" className="stack" noValidate onSubmit={submit}>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        <Field label="الاسم" error={form.errors.name} required>
          {(props) => <Input {...props} data-autofocus value={values.name} onChange={form.on('name')} maxLength={60} />}
        </Field>
        <Field label="تحت تصنيف" hint={hasChildren ? 'التصنيف ده له فروع، فلازم يفضل رئيسي' : 'سيبه فاضي لو تصنيف رئيسي'} error={form.errors.parent_id}>
          {(props) => (
            <Select {...props} value={values.parent_id} onChange={form.on('parent_id')} disabled={hasChildren}>
              <option value="">رئيسي (من غير أب)</option>
              {parents.filter((parent) => parent.id !== category?.id).map((parent) => (
                <option key={parent.id} value={parent.id}>{parent.icon} {parent.name}</option>
              ))}
            </Select>
          )}
        </Field>
        {!isChild && <Field label="الأيقونة">{() => <EmojiPicker value={values.icon} onChange={(icon) => set('icon', icon)} />}</Field>}
        <Field label="اللون" hint={isChild ? 'الفروع بتاخد أيقونة التصنيف الرئيسي' : undefined}>
          {() => <ColorPicker value={values.color} onChange={(color) => set('color', color)} />}
        </Field>
      </form>
    </Modal>
  );
}

export default function CategoryForm({ open, ...props }) {
  return open ? <CategoryDialog {...props} /> : null;
}
