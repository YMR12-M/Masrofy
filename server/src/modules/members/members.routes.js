import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { idParams } from '../../utils/schemas.js';
import { membersController as c } from './members.controller.js';
import { createMemberSchema, updateMemberSchema } from './members.validation.js';

const router = Router();
router.use(authenticate);

router.get('/', c.list);
router.post('/', requirePermission('household.manage'), validate({ body: createMemberSchema }), c.create);
router.get('/:id', requirePermission('household.manage'), validate({ params: idParams('id') }), c.get);
router.patch('/:id', requirePermission('household.manage'), validate({ params: idParams('id'), body: updateMemberSchema }), c.update);
router.delete('/:id', requirePermission('household.manage'), validate({ params: idParams('id') }), c.remove);
router.post('/:id/temp-password', requirePermission('household.manage'), validate({ params: idParams('id') }), c.tempPassword);

export default router;
