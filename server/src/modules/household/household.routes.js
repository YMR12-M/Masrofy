import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import { audit } from '../../utils/audit.js';
import { householdService } from './household.service.js';
import { updateHouseholdSchema } from './household.validation.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => ok(res, await householdService.get(req.user.household_id))));

router.patch('/', requirePermission('household.manage'), validate({ body: updateHouseholdSchema }), asyncHandler(async (req, res) => {
  const { before, after } = await householdService.update(req.user.household_id, req.body);
  await audit(req, { action: 'household.update', entity: 'household', entityId: after.id, before, after });
  ok(res, after);
}));

export default router;
