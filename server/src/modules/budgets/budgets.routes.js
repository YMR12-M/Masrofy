import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { idParams } from '../../utils/schemas.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created, noContent } from '../../utils/response.js';
import { audit } from '../../utils/audit.js';
import { budgetsService } from './budgets.service.js';
import { createBudgetSchema, updateBudgetSchema, listBudgetsQuery } from './budgets.validation.js';

const brief = (budget) => ({ id: budget.id, category_id: budget.category_id, amount_minor: Number(budget.amount_minor), alert_bps: budget.alert_bps });

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('budgets.read'), validate({ query: listBudgetsQuery }), asyncHandler(async (req, res) =>
  ok(res, await budgetsService.list(req.user, req.query))));

const manage = requirePermission('budgets.manage');

router.post('/', manage, validate({ body: createBudgetSchema }), asyncHandler(async (req, res) => {
  const budget = await budgetsService.create(req.user, req.body);
  await audit(req, { action: 'budget.create', entity: 'budget', entityId: budget.id, after: brief(budget) });
  created(res, brief(budget));
}));

router.patch('/:id', manage, validate({ params: idParams('id'), body: updateBudgetSchema }), asyncHandler(async (req, res) => {
  const { before, after } = await budgetsService.update(req.user, req.params.id, req.body);
  await audit(req, { action: 'budget.update', entity: 'budget', entityId: after.id, before: brief(before), after: brief(after) });
  ok(res, brief(after));
}));

router.delete('/:id', manage, validate({ params: idParams('id') }), asyncHandler(async (req, res) => {
  const before = await budgetsService.remove(req.user, req.params.id);
  await audit(req, { action: 'budget.delete', entity: 'budget', entityId: before.id, before: brief(before) });
  noContent(res);
}));

export default router;
