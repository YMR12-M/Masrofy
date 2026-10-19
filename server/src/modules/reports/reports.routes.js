import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { monthKey } from '../../utils/schemas.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/response.js';
import { reportsService } from './reports.service.js';

const summaryQuery = z.object({ month: monthKey.optional() });
const trendQuery = z.object({
  months: z.coerce.number().int().min(2).max(24).default(6),
  end: monthKey.optional(),
});

const router = Router();
router.use(authenticate, requirePermission('reports.read'));

router.get('/summary', validate({ query: summaryQuery }), asyncHandler(async (req, res) =>
  ok(res, await reportsService.summary(req.user, req.query))));

router.get('/trend', validate({ query: trendQuery }), asyncHandler(async (req, res) =>
  ok(res, await reportsService.trend(req.user, req.query))));

router.get('/net-worth', asyncHandler(async (req, res) => ok(res, await reportsService.netWorth(req.user))));

export default router;
