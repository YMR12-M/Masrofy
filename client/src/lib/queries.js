/**
 * استعلامات React Query المشتركة بين الصفحات.
 *
 * المفاتيح تبدأ باسم المورد، فإبطال ['transactions'] مثلًا يجدّد كل قوائم
 * العمليات بأي فلاتر. وأي تعديل على الفلوس يمسّ الأرصدة والميزانيات
 * والتقارير معًا، فـ `useRefreshMoney` يجدّدها كلها مرّة واحدة — ومعها
 * الفواتير والأقساط (حذف عملية مولّدة من فاتورة يرجّعها مستحقّة).
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export function useAccounts({ includeArchived = false, enabled = true } = {}) {
  return useQuery({
    queryKey: ['accounts', { includeArchived }],
    queryFn: () => api.get('/accounts', { include_archived: includeArchived }),
    enabled,
  });
}

export function useCategories({ includeArchived = false } = {}) {
  return useQuery({
    queryKey: ['categories', { includeArchived }],
    queryFn: () => api.get('/categories', { include_archived: includeArchived }),
    staleTime: 60_000,
  });
}

export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: () => api.get('/members'), staleTime: 60_000 });
}

export function useRefreshMoney() {
  const queryClient = useQueryClient();
  return useCallback(() => Promise.all(
    ['accounts', 'transactions', 'budgets', 'reports', 'bills'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  ), [queryClient]);
}

/** المواعيد المستحقّة (والمتأخرة) لحدّ `to` — من الفواتير المتكرّرة والأقساط */
export function useDueBills({ to, enabled = true } = {}) {
  return useQuery({
    queryKey: ['bills', 'due', { to }],
    queryFn: () => api.get('/bills/due', { to }),
    enabled,
  });
}

export function useRecurringRules({ enabled = true } = {}) {
  return useQuery({ queryKey: ['bills', 'recurring'], queryFn: () => api.get('/recurring'), enabled });
}

export function useInstallmentPlans({ enabled = true } = {}) {
  return useQuery({ queryKey: ['bills', 'installments'], queryFn: () => api.get('/installments'), enabled });
}

/**
 * قائمة التصنيفات المسطّحة ← شجرة لنوع واحد: [{ ...رئيسي, children: [...] }]
 * (السيرفر يرسلها مرتّبة: الرئيسي ثم فروعه.)
 */
export function categoryTree(categories = [], kind) {
  const roots = [];
  const byId = new Map();
  for (const category of categories) {
    if (kind && category.kind !== kind) continue;
    if (category.parent_id === null) {
      const node = { ...category, children: [] };
      byId.set(category.id, node);
      roots.push(node);
    }
  }
  for (const category of categories) {
    if (category.parent_id !== null && byId.has(category.parent_id)) byId.get(category.parent_id).children.push(category);
  }
  return roots;
}

/** أيقونة التصنيف: إيموجي الفرع، أو إيموجي أبيه */
export const categoryIcon = (category, categories = []) =>
  category?.icon ?? categories.find((item) => item.id === category?.parent_id)?.icon ?? '🏷️';
