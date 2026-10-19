import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { idParams } from '../../utils/schemas.js';
import { accountsController as c } from './accounts.controller.js';
import { createAccountSchema, updateAccountSchema, listAccountsQuery } from './accounts.validation.js';

const router = Router();
router.use(authenticate);

// الخدمة نفسها تقرّر المشترك والخاص (access.js)؛ هنا بوّابة أولى فقط
const reads = requireAnyPermission('accounts.read', 'accounts.own');
const writes = requireAnyPermission('accounts.manage', 'accounts.own');

router.get('/', reads, validate({ query: listAccountsQuery }), c.list);
router.post('/', writes, validate({ body: createAccountSchema }), c.create);
router.get('/:id', reads, validate({ params: idParams('id') }), c.get);
router.patch('/:id', writes, validate({ params: idParams('id'), body: updateAccountSchema }), c.update);
router.delete('/:id', writes, validate({ params: idParams('id') }), c.remove);

export default router;
