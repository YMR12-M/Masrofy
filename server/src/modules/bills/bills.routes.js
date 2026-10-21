import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { dateRangeRefine, isoDate } from '../../utils/schemas.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import { billsService } from './bills.service.js';

const dueQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine(dateRangeRefine, { message: 'تاريخ النهاية قبل البداية', path: ['to'] });

const router = Router();
router.use(authenticate);

router.get('/due', requireAnyPermission('accounts.read', 'accounts.own'), validate({ query: dueQuery }), asyncHandler(async (req, res) =>
  ok(res, await billsService.due(req.user, req.query))));

export default router;
