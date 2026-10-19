/**
 * نموذج عملية واحد على مستوى التطبيق: يفتحه زر «عملية جديدة» في الشريط
 * العلوي، والزر العائم على الموبايل، وأي صفّ عملية في أي صفحة (للتعديل).
 *
 *   const openTransaction = useQuickAdd();
 *   openTransaction();                              ← عملية جديدة
 *   openTransaction({ defaults: { type: 'income', account_id } });
 *   openTransaction({ transaction: row });          ← تعديل
 */
import { createContext, useCallback, useContext, useState } from 'react';
import TransactionForm from './TransactionForm.jsx';

const QuickAddContext = createContext(null);

export function QuickAddProvider({ children }) {
  const [request, setRequest] = useState(null);
  const open = useCallback((options = {}) => setRequest(options), []);
  return (
    <QuickAddContext.Provider value={open}>
      {children}
      <TransactionForm open={Boolean(request)} {...request} onClose={() => setRequest(null)} />
    </QuickAddContext.Provider>
  );
}

export const useQuickAdd = () => {
  const open = useContext(QuickAddContext);
  if (!open) throw new Error('useQuickAdd خارج QuickAddProvider');
  return open;
};
