import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { idParams } from '../../utils/schemas.js';
import { installmentsController as c } from './installments.controller.js';
import {
  createPlanSchema, updatePlanSchema, itemParams, payItemSchema, settleItemSchema,
} from './installments.validation.js';

const router = Router();
router.use(authenticate);

// نفس بوّابات العمليات، وحقّ حساب الخطّة تفحصه الخدمة (access.js)
const reads = requireAnyPermission('accounts.read', 'accounts.own');
const writes = requireAnyPermission('transactions.write', 'accounts.own');

router.get('/', reads, c.list);
router.post('/', writes, validate({ body: createPlanSchema }), c.create);
router.get('/:id', reads, validate({ params: idParams('id') }), c.get);
router.patch('/:id', writes, validate({ params: idParams('id'), body: updatePlanSchema }), c.update);
router.delete('/:id', writes, validate({ params: idParams('id') }), c.remove);
router.post('/:id/items/:itemId/pay', writes, validate({ params: itemParams, body: payItemSchema }), c.pay);
router.patch('/:id/items/:itemId', writes, validate({ params: itemParams, body: settleItemSchema }), c.settle);

export default router;
