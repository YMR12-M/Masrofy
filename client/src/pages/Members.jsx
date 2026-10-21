/**
 * الأسرة: الأفراد وأدوارهم. صاحب الأسرة والمشرف يضيفون ويعدّلون، والباقي
 * يشوف الأسماء بس. الفرد الجديد ياخد كلمة مؤقتة تظهر مرّة واحدة.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { countText } from '../lib/bills.js';
import { formatDateTime } from '../lib/format.js';
import { useForm } from '../lib/forms.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { Icon } from '../lib/icons.jsx';
import { ROLE_HINTS, ROLE_LABELS } from '../lib/constants.js';
import { useMembers } from '../lib/queries.js';
import {
  Avatar, Badge, Button, Card, ErrorState, Field, Input, ListSkeleton, Menu, MenuItem, Modal, Notice, PageHead, Segmented, Select,
  useConfirm,
} from '../components/ui/index.js';

const ROLE_ORDER = ['owner', 'admin', 'member', 'child', 'viewer'];

function TempPassword({ result, onClose }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.password);
      setCopied(true);
      toast.success('اتنسخت الكلمة');
    } catch {
      toast.error('المتصفح منع النسخ. انسخها بإيدك.');
    }
  };
  return (
    <Modal
      open={Boolean(result)}
      onClose={() => { setCopied(false); onClose(); }}
      size="narrow"
      title="الكلمة المؤقتة"
      dismissible={false}
      footer={<Button variant="primary" onClick={() => { setCopied(false); onClose(); }}>تمام، احتفظت بيها</Button>}
    >
      {result && (
        <div className="stack">
          <p>ادّي الكلمة دي لـ <b>{result.name}</b>، ويدخل بيها بالبريد <span className="num">{result.email}</span>. أول ما يدخل هيختار كلمة خاصة بيه.</p>
          <div className="secret">
            <span className="num" style={{ userSelect: 'all' }}>{result.password}</span>
            <Button variant={copied ? 'secondary' : 'ghost'} size="sm" icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'اتنسخت' : 'نسخ'}</Button>
          </div>
          <Notice tone="warning" icon="eye">الكلمة دي مش هتظهر تاني بعد ما تقفل.</Notice>
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
          {(props) => <Input {...props} data-autofocus value={form.values.full_name} onChange={form.on('full_name')} maxLength={120} placeholder="مثلًا: منى" />}
        </Field>
        <div className="form-grid">
          {!editing && (
            <Field label="البريد الإلكتروني" hint="بيدخل بيه التطبيق" error={form.errors.email} required>
              {(props) => <Input {...props} type="email" autoComplete="off" dir="ltr" className="ltr-input" value={form.values.email} onChange={form.on('email')} placeholder="name@example.com" />}
            </Field>
          )}
          <Field label="الموبايل" hint="اختياري" error={form.errors.phone} className={editing ? 'full' : ''}>
            {(props) => <Input {...props} type="tel" dir="ltr" className="ltr-input" value={form.values.phone} onChange={form.on('phone')} placeholder="01xxxxxxxxx" />}
          </Field>
        </div>
        <Field label="الدور" hint={ROLE_HINTS[form.values.role]} error={form.errors.role}>
          {(props) => (
            <Select {...props} value={form.values.role} onChange={form.on('role')}>
              {roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </Select>
          )}
        </Field>
        {editing && (
          <Field label="الدخول" hint={form.values.status === 'suspended' ? 'الموقوف مش هيقدر يدخل، وجلساته المفتوحة هتتقفل. بياناته بتفضل زي ما هي.' : undefined}>
            {() => (
              <Segmented
                block
                label="حالة الدخول"
                value={form.values.status}
                onChange={(status) => form.set('status', status)}
                options={[{ value: 'active', label: 'مسموح', icon: 'check' }, { value: 'suspended', label: 'موقوف', icon: 'lock' }]}
              />
            )}
          </Field>
        )}
      </form>
    </Modal>
  );
}

function MemberRow({ member, me, manage, canTouch, onEdit, onReset, onRemove }) {
  const meta = [];
  if (member.email) meta.push(<span key="email" className="num">{member.email}</span>);
  if (member.last_login_at) meta.push(<span key="login">آخر دخول {formatDateTime(member.last_login_at)}</span>);
  return (
    <div className="list-item">
      <Avatar name={member.full_name} size={40} />
      <div className="grow stack" style={{ gap: 4 }}>
        <span className="title truncate">
          {member.full_name}
          {me && <span className="faint xsmall" style={{ fontWeight: 400 }}> (إنت)</span>}
        </span>
        <span className="row wrap" style={{ gap: 6 }}>
          <Badge tone={member.role === 'owner' ? 'primary' : ''}>{ROLE_LABELS[member.role]}</Badge>
          {member.status === 'suspended' && <Badge tone="danger"><Icon name="lock" size={12} /> موقوف</Badge>}
          {manage && member.must_change_password && member.status !== 'suspended' && <Badge tone="warning">لسه ما دخلش</Badge>}
          {meta.length > 0 && (
            <span className="meta truncate" style={{ minWidth: 0 }}>
              {meta.reduce((parts, part, index) => (index ? [...parts, ' · ', part] : [part]), [])}
            </span>
          )}
        </span>
      </div>
      {canTouch && (
        <Menu label={`خيارات ${member.full_name}`}>
          <MenuItem icon="edit" onClick={onEdit}>تعديل</MenuItem>
          <MenuItem icon="key" onClick={onReset}>كلمة مؤقتة جديدة</MenuItem>
          <MenuItem icon="trash" danger onClick={onRemove}>حذف من الأسرة</MenuItem>
        </Menu>
      )}
    </div>
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
  const list = members.data ?? [];

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

  const alone = members.isSuccess && list.length === 1;

  return (
    <div className="page">
      <PageHead
        title="الأسرة"
        description={members.isSuccess
          ? `${countText(list.length, { one: 'فرد واحد', two: 'فردين', few: 'أفراد', many: 'فرد' })} على مصروفي${manage ? '، وكل واحد بدور يناسبه' : ''}`
          : 'أفراد أسرتك على مصروفي'}
        actions={manage && <Button variant="primary" icon="plus" onClick={() => setDialog({})}>فرد جديد</Button>}
      />

      <div className="grid split">
        <Card flush title="الأفراد">
          {members.isLoading && <ListSkeleton rows={3} />}
          {members.isError && <ErrorState error={members.error} onRetry={members.refetch} />}
          <div className="list">
            {list.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                me={member.id === user.id}
                manage={manage}
                canTouch={canTouch(member)}
                onEdit={() => setDialog({ member })}
                onReset={() => resetPassword(member)}
                onRemove={() => remove(member)}
              />
            ))}
          </div>
          {alone && manage && (
            <div className="card-foot">
              <Notice icon="users" action={<Button size="sm" icon="plus" onClick={() => setDialog({})}>ضيف فرد</Button>}>
                لسه إنت لوحدك. ضيف شريكك أو ولادك عشان تسجّلوا مصاريف البيت مع بعض.
              </Notice>
            </div>
          )}
        </Card>

        <Card title="مين يشوف إيه؟">
          <div className="stack">
            <dl className="role-list">
              {ROLE_ORDER.map((role) => (
                <div key={role}>
                  <dt><Badge tone={role === 'owner' ? 'primary' : ''}>{ROLE_LABELS[role]}</Badge></dt>
                  <dd>{ROLE_HINTS[role]}</dd>
                </div>
              ))}
            </dl>
            <p className="privacy-line"><Icon name="lock" size={16} />الحساب الخاص بأي فرد مش بيظهر لغيره، ولا حتى لصاحب الأسرة.</p>
          </div>
        </Card>
      </div>

      {dialog && <MemberDialog member={dialog.member} actorRole={user.role} onClose={() => setDialog(null)} onCreated={setSecret} />}
      <TempPassword result={secret} onClose={() => setSecret(null)} />
    </div>
  );
}
