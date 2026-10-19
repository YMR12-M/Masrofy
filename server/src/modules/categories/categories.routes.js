import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { idParams } from '../../utils/schemas.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created, noContent } from '../../utils/response.js';
import { audit } from '../../utils/audit.js';
import { categoriesService } from './categories.service.js';
import { createCategorySchema, updateCategorySchema, listCategoriesQuery } from './categories.validation.js';

const brief = (category) => ({ id: category.id, kind: category.kind, name: category.name, parent_id: category.parent_id, archived_at: category.archived_at });

const router = Router();
router.use(authenticate);

// كل أفراد الأسرة يقرؤون التصنيفات (لازمة لتسجيل أي عملية)
router.get('/', validate({ query: listCategoriesQuery }), asyncHandler(async (req, res) =>
  ok(res, await categoriesService.list(req.user.household_id, req.query))));

const manage = requirePermission('categories.manage');

router.post('/', manage, validate({ body: createCategorySchema }), asyncHandler(async (req, res) => {
  const category = await categoriesService.create(req.user.household_id, req.body);
  await audit(req, { action: 'category.create', entity: 'category', entityId: category.id, after: brief(category) });
  created(res, category);
}));

router.patch('/:id', manage, validate({ params: idParams('id'), body: updateCategorySchema }), asyncHandler(async (req, res) => {
  const { before, after } = await categoriesService.update(req.user.household_id, req.params.id, req.body);
  await audit(req, { action: 'category.update', entity: 'category', entityId: after.id, before: brief(before), after: brief(after) });
  ok(res, after);
}));

router.delete('/:id', manage, validate({ params: idParams('id') }), asyncHandler(async (req, res) => {
  const { before, archived } = await categoriesService.remove(req.user.household_id, req.params.id);
  await audit(req, { action: archived ? 'category.archive' : 'category.delete', entity: 'category', entityId: before.id, before: brief(before) });
  if (archived) return ok(res, { archived: true });
  return noContent(res);
}));

export default router;
