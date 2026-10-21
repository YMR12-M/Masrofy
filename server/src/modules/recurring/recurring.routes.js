import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { idParams } from '../../utils/schemas.js';
import { recurringController as c } from './recurring.controller.js';
import {
  createRecurringSchema, updateRecurringSchema, postOccurrenceSchema, skipOccurrenceSchema,
} from './recurring.validation.js';

const router = Router();
router.use(authenticate);

// نفس بوّابات العمليات: الفاتورة قالب عملية. وحقّ كل حساب بعينه تفحصه الخدمة (access.js)
const reads = requireAnyPermission('accounts.read', 'accounts.own');
const writes = requireAnyPermission('transactions.write', 'accounts.own');

router.get('/', reads, c.list);
router.post('/', writes, validate({ body: createRecurringSchema }), c.create);
router.get('/:id', reads, validate({ params: idParams('id') }), c.get);
router.patch('/:id', writes, validate({ params: idParams('id'), body: updateRecurringSchema }), c.update);
router.delete('/:id', writes, validate({ params: idParams('id') }), c.remove);
router.post('/:id/post', writes, validate({ params: idParams('id'), body: postOccurrenceSchema }), c.post);
router.post('/:id/skip', writes, validate({ params: idParams('id'), body: skipOccurrenceSchema }), c.skip);

export default router;
