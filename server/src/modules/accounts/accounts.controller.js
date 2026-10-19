import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created, noContent } from '../../utils/response.js';
import { audit } from '../../utils/audit.js';
import { accountsService } from './accounts.service.js';

const brief = (account) => ({
  id: account.id, name: account.name, type: account.type, is_shared: account.is_shared,
  opening_balance_minor: account.opening_balance_minor, archived_at: account.archived_at,
});

export const accountsController = {
  list: asyncHandler(async (req, res) => ok(res, await accountsService.list(req.user, req.query))),

  get: asyncHandler(async (req, res) => ok(res, await accountsService.find(req.user, req.params.id))),

  create: asyncHandler(async (req, res) => {
    const account = await accountsService.create(req.user, req.body);
    await audit(req, { action: 'account.create', entity: 'account', entityId: account.id, after: brief(account) });
    created(res, account);
  }),

  update: asyncHandler(async (req, res) => {
    const { before, after } = await accountsService.update(req.user, req.params.id, req.body);
    await audit(req, { action: 'account.update', entity: 'account', entityId: after.id, before: brief(before), after: brief(after) });
    ok(res, after);
  }),

  remove: asyncHandler(async (req, res) => {
    const { before, archived } = await accountsService.remove(req.user, req.params.id);
    await audit(req, { action: archived ? 'account.archive' : 'account.delete', entity: 'account', entityId: before.id, before: brief(before) });
    if (archived) return ok(res, { archived: true });
    return noContent(res);
  }),
};
