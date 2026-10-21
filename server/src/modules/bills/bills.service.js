/**
 * «اللي عليّ»: المواعيد المستحقّة من الفواتير المتكرّرة والأقساط في قائمة
 * واحدة مرتّبة بالتاريخ — للرئيسية وصفحة الفواتير.
 *
 * كل بند فيه ما يلزم الواجهة لتعرضه وتسجّله بضغطة (source + source_id/item_id
 * + due_on)، و`status`: overdue (فات معاده) · today · upcoming.
 */
import { addDays, todayIn } from '../../utils/dates.js';
import { recurringService } from '../recurring/recurring.service.js';
import { installmentsService } from '../installments/installments.service.js';

/** المدى الافتراضي لـ «القريب»: شهر من النهارده */
const DEFAULT_DAYS = 30;

export const billsService = {
  async due(user, { from, to } = {}) {
    const today = todayIn(user.timezone);
    const until = to ?? addDays(today, DEFAULT_DAYS);
    const range = { from, to: until, today };
    const [recurring, installments] = await Promise.all([
      recurringService.dueItems(user, range),
      installmentsService.dueItems(user, range),
    ]);
    const items = [...recurring.items, ...installments.items]
      .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.name.localeCompare(b.name, 'ar'));
    return {
      today,
      from: from ?? null,
      to: until,
      items,
      // كام فاتورة/خطّة شغّالة أصلًا (الرئيسية تخفي البطاقة لو مفيش)
      sources: { recurring: recurring.active, installments: installments.active },
    };
  },
};
