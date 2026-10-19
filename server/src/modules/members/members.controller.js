import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created, noContent } from '../../utils/response.js';
import { audit } from '../../utils/audit.js';
import { membersService } from './members.service.js';

const brief = (member) => ({ id: member.id, full_name: member.full_name, email: member.email, role: member.role, status: member.status });

export const membersController = {
  list: asyncHandler(async (req, res) => ok(res, await membersService.list(req.user))),

  get: asyncHandler(async (req, res) => ok(res, await membersService.get(req.user, req.params.id))),

  create: asyncHandler(async (req, res) => {
    const result = await membersService.create(req.user, req.body);
    await audit(req, { action: 'member.create', entity: 'user', entityId: result.member.id, after: brief(result.member) });
    created(res, result);
  }),

  update: asyncHandler(async (req, res) => {
    const { before, after } = await membersService.update(req.user, req.params.id, req.body);
    await audit(req, { action: 'member.update', entity: 'user', entityId: after.id, before: brief(before), after: brief(after) });
    ok(res, after);
  }),

  remove: asyncHandler(async (req, res) => {
    const before = await membersService.remove(req.user, req.params.id);
    await audit(req, { action: 'member.delete', entity: 'user', entityId: before.id, before: brief(before) });
    noContent(res);
  }),

  tempPassword: asyncHandler(async (req, res) => {
    const result = await membersService.issueTempPassword(req.user, req.params.id);
    await audit(req, { action: 'member.temp_password', entity: 'user', entityId: result.member.id });
    ok(res, { temp_password: result.temp_password });
  }),
};
