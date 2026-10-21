/**
 * الأسرة: الأفراد وأدوارهم. صاحب الأسرة والمشرف يضيفون ويعدّلون، والباقي
 * يشوف الأسماء بس. الفرد الجديد ياخد كلمة مؤقتة تظهر مرّة واحدة.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { ROLE_HINTS, ROLE_LABELS } from '../lib/constants.js';
import { useMembers } from '../lib/queries.js';
import {
  Avatar, Badge, Button, Card, ErrorState, Field, Input, ListSkeleton, Menu, MenuItem, Modal, Notice, PageHead, Select, useConfirm,
} from '../components/ui/index.js';

const ROLE_ORDER = ['owner', 'admin', 'member', 'child', 'viewer'];

function TempPassword({ result, onClose }) {
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.password); toast.success('اتنسخت'); } catch { /* المتصفح منع النسخ */ }
  };
  return (
    <Modal open={Boolean(result)} onClose={onClose} size="narrow" title="الكلمة المؤقتة" footer={<Button variant="primary" onClick={onClose}>تمام، احتفظت بيها</Button>}>
      {result && (
        <div className="stack">
          <p>ادّي الكلمة دي لـ <b>{result.name}</b> يدخل بيها بالبريد <span className="num">{result.email}</span>. أول ما يدخل هيختار كلمة خاصة بيه.</p>
          <div className="secret">
            <span className="num">{result.password}</span>
            <Button variant="ghost" size="sm" icon="copy" onClick={copy} aria-label="نسخ" />
          </div>
          <Notice tone="warning" icon="eye">الكلمة دي مش هتظهر تاني.</Notice>
        </div>
      )}
    </Modal>
  );
}

function MemberDialog({ member, actorRole, onClose, onCreated }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const editing = Boolean(member);
  const form = useForm(() => ({
    full_name: member?.full_name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    role: member?.role ?? 'member',
    status: member?.status ?? 'active',
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const roles = ROLE_ORDER.filter((role) => role !== 'owner' || actorRole === 'owner');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { values } = form;
    try {
      if (editing) {
        await api.patch(`/members/${member.id}`, { full_name: values.full_name, phone: values.phone, role: values.role, status: values.status });
        toast.success('اتعدّلت البيانات');
      } else {
        const result = await api.post('/members', { full_name: values.full_name, email: values.email.trim(), phone: values.phone, role: values.role });
        onCreated({ name: result.member.full_name, email: result.member.email, password: result.temp_password });
      }
      await queryClient.invalidateQueries({ queryKey: ['members'] });
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
      title={editing ? `تعديل ${member.full_name}` : 'فرد جديد'}
      footer={(
        <>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" type="submit" form="member-form" loading={busy}>{editing ? 'حفظ' : 'إضافة'}</Button>
        </>
      )}
    >
      <form id="member-form" className="stack" noValidate onSubmit={submit}>
        {message && <Notice tone="danger" icon="alert">{message}</Notice>}
        <Field label="الاسم" error={form.errors.full_name} required>
          {(props) => <Input {...props} data-autofocus value={form.values.full_name} onChange={form.on('full_name')} maxLength={120} />}
        </Field>
        {!editing && (
          <Field label="البريد الإلكتروني" hint="بيدخل بيه التطبيق" error={form.errors.email} required>
            {(props) => <Input {...props} type="email" dir="ltr" className="ltr-input" value={form.values.email} onChange={form.on('email')} />}
          </Field>
        )}
        <Field label="الموبايل" error={form.errors.phone}>
          {(props) => <Input {...props} type="tel" dir="ltr" className="ltr-input" value={form.values.phone} onChange={form.on('phone')} />}
        </Field>
        <Field label="الدور" hint={ROLE_HINTS[form.values.role]} error={form.errors.role}>
          {(props) => (
            <Select {...props} value={form.values.role} onChange={form.on('role')}>
              {roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </Select>
          )}
        </Field>
        {editing && (
          <Field label="الحالة" hint={form.values.status === 'suspended' ? 'الموقوف مش هيقدر يدخل، وجلساته المفتوحة هتتقفل' : undefined}>
            {(props) => (
              <Select {...props} value={form.values.status} onChange={form.on('status')}>
                <option value="active">نشط</option>
                <option value="suspended">موقوف</option>
              </Select>
            )}
          </Field>
        )}
      </form>
    </Modal>
  );
}

export default function Members() {
  useDocumentTitle('الأسرة');
  const { user, can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const members = useMembers();
  const [dialog, setDialog] = useState(null);
  const [secret, setSecret] = useState(null);
  const manage = can('household.manage');

  const canTouch = (member) => manage && member.id !== user.id && (member.role !== 'owner' || user.role === 'owner');

  async function remove(member) {
    const ok = await confirm({
      title: `حذف ${member.full_name} من الأسرة؟`,
      message: 'مش هيقدر يدخل تاني. عملياته القديمة هتفضل باسمه، وحساباته الخاصة هتتأرشف زي ما هي من غير ما حد يشوفها.',
      danger: true,
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    try {
      await api.del(`/members/${member.id}`);
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('اتحذف من الأسرة');
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function resetPassword(member) {
    const ok = await confirm({ title: `كلمة مؤقتة جديدة لـ ${member.full_name}؟`, message: 'كلمته الحالية هتبطل، وكل جلساته هتتقفل.', confirmLabel: 'إصدار كلمة' });
    if (!ok) return;
    try {
      const result = await api.post(`/members/${member.id}/temp-password`);
      setSecret({ name: member.full_name, email: member.email, password: result.temp_password });
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <div className="page">
      <PageHead
        title="الأسرة"
        description={manage ? 'ضيف أفراد أسرتك، وكل واحد بدور يناسبه' : 'أفراد أسرتك على مصروفي'}
        actions={manage && <Button variant="primary" icon="plus" onClick={() => setDialog({})}>فرد جديد</Button>}
      />

      <Card flush>
        {members.isLoading && <ListSkeleton rows={3} />}
        {members.isError && <ErrorState error={members.error} onRetry={members.refetch} />}
        <div className="list">
          {(members.data ?? []).map((member) => (
            <div key={member.id} className="list-item">
              <Avatar name={member.full_name} size={40} />
              <div className="grow">
                <div className="title truncate">{member.full_name}{member.id === user.id && <span className="faint xsmall"> (إنت)</span>}</div>
                <div className="meta truncate">
                  {member.email && <span className="num">{member.email}</span>}
                  {member.last_login_at && <> · آخر دخول {formatDateTime(member.last_login_at)}</>}
                  {manage && member.must_change_password && <> · لسه ما دخلش</>}
                </div>
              </div>
              <span className="row" style={{ gap: 6 }}>
                {member.status === 'suspended' && <Badge tone="danger">موقوف</Badge>}
                <Badge tone={member.role === 'owner' ? 'primary' : ''}>{ROLE_LABELS[member.role]}</Badge>
                {canTouch(member) && (
                  <Menu label={`خيارات ${member.full_name}`}>
                    <MenuItem icon="edit" onClick={() => setDialog({ member })}>تعديل</MenuItem>
                    <MenuItem icon="key" onClick={() => resetPassword(member)}>كلمة مؤقتة جديدة</MenuItem>
                    <MenuItem icon="trash" danger onClick={() => remove(member)}>حذف من الأسرة</MenuItem>
                  </Menu>
                )}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="مين يشوف إيه؟">
        <ul className="stack sm small muted" style={{ margin: 0, paddingInlineStart: 18 }}>
          {ROLE_ORDER.map((role) => <li key={role}><b style={{ color: 'var(--text)' }}>{ROLE_LABELS[role]}:</b> {ROLE_HINTS[role]}</li>)}
          <li>الحساب الخاص بأي فرد مش بيظهر لغيره، ولا حتى لصاحب الأسرة.</li>
        </ul>
      </Card>

      {dialog && <MemberDialog member={dialog.member} actorRole={user.role} onClose={() => setDialog(null)} onCreated={setSecret} />}
      <TempPassword result={secret} onClose={() => setSecret(null)} />
    </div>
  );
}
