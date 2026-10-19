import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { query, queryOne, safeInt } from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paged, pageMeta } from '../../utils/response.js';
import { pagingSchema, idSchema } from '../../utils/schemas.js';

/** سجل التدقيق للأسرة: الأحدث أولًا، بفلتر اختياري على النوع أو الفرد */
const listQuery = pagingSchema.extend({
  entity: z.enum(['household', 'user', 'account', 'category', 'transaction', 'budget']).optional(),
  user_id: idSchema.optional(),
});

const router = Router();
router.use(authenticate, requirePermission('audit.read'));

router.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const where = ['l.household_id = ?'];
  const params = [req.user.household_id];
  if (req.query.entity) { where.push('l.entity = ?'); params.push(req.query.entity); }
  if (req.query.user_id) { where.push('l.user_id = ?'); params.push(req.query.user_id); }

  const pageSize = safeInt(req.query.page_size, { min: 1, max: 100, fallback: 25 });
  const page = safeInt(req.query.page, { min: 1, max: 100_000, fallback: 1 });
  const [rows, count] = await Promise.all([
    query(
      `SELECT l.id, l.action, l.entity, l.entity_id, l.before_json, l.after_json, l.created_at,
              l.user_id, u.full_name AS user_name
         FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY l.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    ),
    queryOne(`SELECT COUNT(*) AS n FROM audit_logs l WHERE ${where.join(' AND ')}`, params),
  ]);
  paged(res, rows, pageMeta(page, pageSize, count.n));
}));

export default router;
