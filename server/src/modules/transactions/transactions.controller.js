import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created, noContent, paged } from '../../utils/response.js';
import { audit } from '../../utils/audit.js';
import { toCsv, money } from '../../utils/csv.js';
import { transactionsService } from './transactions.service.js';

const TYPE_LABELS = { expense: 'مصروف', income: 'دخل', transfer: 'تحويل' };

const brief = (tx) => ({
  id: tx.id, type: tx.type, account_id: tx.account_id, to_account_id: tx.to_account_id,
  category_id: tx.category_id, amount_minor: tx.amount_minor, occurred_on: tx.occurred_on,
});

const CSV_COLUMNS = [
  { header: 'التاريخ', value: (row) => row.occurred_on },
  { header: 'النوع', value: (row) => TYPE_LABELS[row.type] },
  { header: 'الحساب', value: (row) => row.account_name },
  { header: 'إلى حساب', value: (row) => row.to_account_name },
  { header: 'التصنيف الرئيسي', value: (row) => row.parent_category_name ?? row.category_name },
  { header: 'التصنيف', value: (row) => (row.parent_category_name ? row.category_name : null) },
  // المصروف بالسالب كي يجمعه Excel مباشرة مع الدخل
  { header: 'المبلغ', value: (row) => money(row.type === 'expense' ? -row.amount_minor : row.amount_minor) },
  { header: 'الجهة', value: (row) => row.payee },
  { header: 'ملاحظة', value: (row) => row.note },
  { header: 'سجّلها', value: (row) => row.created_by_name },
];

export const transactionsController = {
  list: asyncHandler(async (req, res) => {
    const { rows, meta } = await transactionsService.list(req.user, req.query);
    paged(res, rows, meta);
  }),

  export: asyncHandler(async (req, res) => {
    const rows = await transactionsService.exportRows(req.user, req.query);
    const name = `masrofy-transactions-${req.query.from ?? 'all'}${req.query.to ? `_${req.query.to}` : ''}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(toCsv(rows, CSV_COLUMNS));
  }),

  get: asyncHandler(async (req, res) => ok(res, await transactionsService.find(req.user, req.params.id))),

  create: asyncHandler(async (req, res) => {
    const tx = await transactionsService.create(req.user, req.body);
    await audit(req, { action: 'transaction.create', entity: 'transaction', entityId: tx.id, after: brief(tx) });
    created(res, tx);
  }),

  update: asyncHandler(async (req, res) => {
    const { before, after } = await transactionsService.update(req.user, req.params.id, req.body);
    await audit(req, { action: 'transaction.update', entity: 'transaction', entityId: after.id, before: brief(before), after: brief(after) });
    ok(res, after);
  }),

  remove: asyncHandler(async (req, res) => {
    const before = await transactionsService.remove(req.user, req.params.id);
    await audit(req, { action: 'transaction.delete', entity: 'transaction', entityId: before.id, before: brief(before) });
    noContent(res);
  }),
};
