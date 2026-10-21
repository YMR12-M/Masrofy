/**
 * الحسابات: صافي الثروة، ثم بطاقة لكل حساب مقسّمة إلى «حسابات الأسرة»
 * و«حساباتي الخاصة». البطاقة تفتح عمليات الحساب، وقائمتها للتعديل والأرشفة.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { ACCOUNT_TYPE } from '../lib/constants.js';
import { formatMoney } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useAccounts, useRefreshMoney } from '../lib/queries.js';
import AccountForm from '../components/accounts/AccountForm.jsx';
import { useQuickAdd } from '../components/transactions/QuickAdd.jsx';
import {
  AccountMark, Badge, Button, Card, EmptyState, ErrorState, Menu, MenuItem, MoneyFigure, Notice, PageHead, Plate, Skeleton, Switch,
  useConfirm,
} from '../components/ui/index.js';

function AccountCard({ account, currency, onEdit }) {
  const toast = useToast();
  const confirm = useConfirm();
  const refreshMoney = useRefreshMoney();
  const openTransaction = useQuickAdd();
  const type = ACCOUNT_TYPE[account.type];
  const archived = Boolean(account.archived_at);
  const debt = account.type === 'card' && account.balance_minor < 0;

  async function remove() {
    const ok = await confirm({
      title: `أرشفة «${account.name}»؟`,
      message: 'لو الحساب مفيهوش عمليات هيتحذف نهائيًّا. لو فيه، هيتأرشف: يختفي من القوائم وصافي الثروة وتفضل عملياته في التقارير، وتقدر ترجّعه بعدين.',
      danger: true,
      confirmLabel: 'أرشفة',
    });
    if (!ok) return;
    try {
      const result = await api.del(`/accounts/${account.id}`);
      refreshMoney();
      toast.success(result?.archived ? 'اتأرشف الحساب' : 'اتحذف الحساب');
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function restore() {
    try {
      await api.patch(`/accounts/${account.id}`, { archived: false });
      refreshMoney();
      toast.success('رجع الحساب');
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <article className={`card account-card ${archived ? 'archived' : ''}`} style={{ '--acc': account.color }}>
      <Link className="open-link" to={`/transactions?account_id=${account.id}&month=all`} aria-label={`عمليات ${account.name}`} />
      <div className="row between start">
        <div className="row" style={{ minWidth: 0 }}>
          <AccountMark account={account} />
          <div style={{ minWidth: 0 }}>
            <div className="bold truncate">{account.name}</div>
            <div className="xsmall faint truncate">{account.institution || type?.label}</div>
          </div>
        </div>
        {(account.can_manage || account.can_record) && (
          <div className="card-menu">
            <Menu label={`خيارات ${account.name}`}>
              {account.can_record && <MenuItem icon="plus" onClick={() => openTransaction({ defaults: { account_id: account.id } })}>عملية على الحساب</MenuItem>}
              {account.can_manage && !archived && <MenuItem icon="edit" onClick={() => onEdit(account)}>تعديل</MenuItem>}
              {account.can_manage && !archived && <MenuItem icon="archive" danger onClick={remove}>أرشفة</MenuItem>}
              {account.can_manage && archived && <MenuItem icon="restore" onClick={restore}>إرجاع الحساب</MenuItem>}
            </Menu>
          </div>
        )}
      </div>
      <div>
        <MoneyFigure className={`balance ${account.balance_minor < 0 ? 'amount-negative' : ''}`} size="lg" minor={account.balance_minor} currency={currency} compact />
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
          {account.is_shared ? <Badge>مشترك</Badge> : <Badge tone="primary"><Icon name="lock" size={12} /> خاص</Badge>}
          {archived && <Badge tone="warning">مؤرشف</Badge>}
          {debt && <Badge tone="danger">مديونية</Badge>}
          {!account.include_in_net_worth && <Badge>خارج صافي الثروة</Badge>}
        </div>
      </div>
    </article>
  );
}

/** صافي الثروة: لوحة الصفحة (اللي معاك ناقص اللي عليك) */
function NetWorth({ accounts, currency }) {
  const counted = accounts.filter((account) => account.include_in_net_worth && !account.archived_at);
  const assets = counted.filter((account) => account.balance_minor > 0).reduce((sum, account) => sum + account.balance_minor, 0);
  const debts = counted.filter((account) => account.balance_minor < 0).reduce((sum, account) => sum - account.balance_minor, 0);
  const net = assets - debts;
  return (
    <Plate aria-label="صافي الثروة">
      <span className="plate-label">صافي الثروة</span>
      <MoneyFigure className={`plate-figure ${net < 0 ? 'negative' : ''}`} minor={net} currency={currency} compact />
      <div className="plate-row">
        <span><Icon name="arrow-down" size={16} />اللي معاك <b className="num">{formatMoney(assets, currency)}</b></span>
        <span><Icon name="arrow-up" size={16} />اللي عليك <b className="num">{formatMoney(debts, currency)}</b></span>
      </div>
    </Plate>
  );
}

export default function Accounts() {
  useDocumentTitle('الحسابات');
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const accounts = useAccounts({ includeArchived: showArchived });
  const currency = user.household.currency;
  const canCreate = can('accounts.manage') || can('accounts.own');
  const creating = params.get('new') === '1';
  const welcome = params.get('welcome') === '1';

  const closeForm = () => {
    setEditing(null);
    if (creating || welcome) setParams({}, { replace: true });
  };

  const list = accounts.data ?? [];
  const shared = list.filter((account) => account.is_shared);
  const mine = list.filter((account) => !account.is_shared);

  const section = (title, items, hint) => items.length > 0 && (
    <section className="stack sm">
      <div className="section-head"><h2>{title}</h2>{hint && <span className="xsmall faint">{hint}</span>}</div>
      <div className="accounts-grid">
        {items.map((account) => <AccountCard key={account.id} account={account} currency={currency} onEdit={setEditing} />)}
      </div>
    </section>
  );

  return (
    <div className="page">
      <PageHead
        title="الحسابات"
        description="كل مكان فيه فلوس: كاش، بنك، محفظة، بطاقة…"
        actions={canCreate && <Button variant="primary" icon="plus" onClick={() => setParams({ new: '1' }, { replace: true })}>حساب جديد</Button>}
      />

      {welcome && (
        <Notice tone="success" icon="check">
          أهلًا بيك في مصروفي! جهّزنا لك تصنيفات مقترحة للمصاريف والدخل. ابدأ بإضافة حساباتك (الكاش اللي معاك وحسابك في البنك)، وبعدها سجّل أول مصروف.
        </Notice>
      )}

      {accounts.isLoading && <div className="accounts-grid">{[1, 2, 3].map((key) => <Skeleton key={key} height={150} style={{ borderRadius: 14 }} />)}</div>}
      {accounts.isError && <ErrorState error={accounts.error} onRetry={accounts.refetch} />}

      {accounts.isSuccess && list.length === 0 && (
        <Card>
          <EmptyState
            icon="wallet"
            title="لسه مفيش حسابات"
            description="الحساب هو المكان اللي فيه الفلوس. ابدأ بالكاش اللي في محفظتك ورصيده النهارده."
            action={canCreate && <Button variant="primary" icon="plus" onClick={() => setParams({ new: '1' }, { replace: true })}>ضيف أول حساب</Button>}
          />
        </Card>
      )}

      {list.length > 0 && (
        <>
          <NetWorth accounts={list} currency={currency} />
          {section('حسابات الأسرة', shared, 'كل الأسرة تشوفها')}
          {section('حساباتي الخاصة', mine, 'محدّش يشوفها غيرك')}
        </>
      )}

      {accounts.isSuccess && (
        <Switch checked={showArchived} onChange={setShowArchived} label="إظهار الحسابات المؤرشفة" />
      )}

      <AccountForm open={creating || Boolean(editing)} account={editing} onClose={closeForm} />
    </div>
  );
}
