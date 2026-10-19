import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { idParams } from '../../utils/schemas.js';
import { transactionsController as c } from './transactions.controller.js';
import {
  createTransactionSchema, updateTransactionSchema, listTransactionsQuery, exportTransactionsQuery,
} from './transactions.validation.js';

const router = Router();
router.use(authenticate);

// البوّابة هنا عامّة، وحقّ كل حساب بعينه تتحقّق منه الخدمة (accounts/access.js)
const reads = requireAnyPermission('accounts.read', 'accounts.own');
const writes = requireAnyPermission('transactions.write', 'accounts.own');

router.get('/', reads, validate({ query: listTransactionsQuery }), c.list);
router.get('/export', reads, validate({ query: exportTransactionsQuery }), c.export);
router.post('/', writes, validate({ body: createTransactionSchema }), c.create);
router.get('/:id', reads, validate({ params: idParams('id') }), c.get);
router.patch('/:id', writes, validate({ params: idParams('id'), body: updateTransactionSchema }), c.update);
router.delete('/:id', writes, validate({ params: idParams('id') }), c.remove);

export default router;
