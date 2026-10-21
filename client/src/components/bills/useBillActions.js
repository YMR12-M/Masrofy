/**
 * إجراءات بنود «اللي عليّ»: تسجيل المعاد (دفعت/اتقبض)، تخطّيه، أو علامة
 * «اتدفع قبل كده» للقسط. كلها تجدّد الفلوس والفواتير بعدها، وتمنع الضغط
 * المزدوج على نفس البند (والسيرفر نفسه لا يسجّل المعاد مرتين).
 */
import { useCallback, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { installmentLabel } from '../../lib/bills.js';
import { useRefreshMoney } from '../../lib/queries.js';
import { useConfirm } from '../ui/index.js';

const itemPath = (item) => `/installments/${item.source_id}/items/${item.item_id}`;

export function useBillActions() {
  const toast = useToast();
  const confirm = useConfirm();
  const refreshMoney = useRefreshMoney();
  const [busy, setBusy] = useState(null);

  /** يعيد نتيجة الإجراء، أو null لو فشل (والخطأ يظهر كإشعار) — إلا `inline` فيُرمى للنموذج */
  const run = useCallback(async (item, action, { inline = false } = {}) => {
    setBusy(item.key);
    try {
      return await action();
    } catch (error) {
      if (inline) throw error;
      toast.error(error.message);
      return null;
    } finally {
      setBusy(null);
    }
  }, [toast]);

  /** `overrides`: { amount_minor?, occurred_on?, account_id?, note? } للمرة دي */
  const post = useCallback((item, overrides = {}, options = {}) => run(item, async () => {
    const result = item.source === 'recurring'
      ? await api.post(`/recurring/${item.source_id}/post`, { due_on: item.due_on, ...overrides })
      : await api.post(`${itemPath(item)}/pay`, overrides);
    await refreshMoney();
    const already = result.already_posted || result.already_paid;
    toast.success(already ? 'ده متسجّل بالفعل' : `اتسجّل: ${item.name}${item.installment ? ` (${installmentLabel(item.installment)})` : ''}`);
    return result;
  }, options), [run, refreshMoney, toast]);

  const skip = useCallback(async (item) => {
    const ok = await confirm({
      title: `تخطّي «${item.name}» المرة دي؟`,
      message: 'المعاد ده هيختفي من غير ما يتسجّل كمصروف، مثلًا لو الفاتورة مجتش أو اتدفعت بره التطبيق.',
      confirmLabel: 'تخطّي',
    });
    if (!ok) return null;
    return run(item, async () => {
      await api.post(`/recurring/${item.source_id}/skip`, { due_on: item.due_on });
      await refreshMoney();
      toast.success('اتخطّى المعاد');
    });
  }, [confirm, run, refreshMoney, toast]);

  /** قسط اتدفع قبل استخدام التطبيق: يتعلّم مدفوع من غير عملية (أو تتشال العلامة) */
  const settle = useCallback(async (item, settled = true) => {
    if (settled) {
      const ok = await confirm({
        title: `${installmentLabel(item.installment)} اتدفع قبل كده؟`,
        message: 'هيتحسب مدفوع في الخطّة من غير ما يتسجّل مصروف. لو دفعته فعلًا دلوقتي استخدم «دفعت» بدلها.',
        confirmLabel: 'أيوه، اتدفع',
      });
      if (!ok) return null;
    }
    return run(item, async () => {
      await api.patch(itemPath(item), { settled });
      await refreshMoney();
      toast.success(settled ? 'اتعلّم مدفوع' : 'اتشالت العلامة');
    });
  }, [confirm, run, refreshMoney, toast]);

  return { post, skip, settle, busy };
}
