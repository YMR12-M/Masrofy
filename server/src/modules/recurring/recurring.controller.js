import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created, noContent } from '../../utils/response.js';
import { audit } from '../../utils/audit.js';
import { briefRule, briefTransaction, recurringService } from './recurring.service.js';

export const recurringController = {
  list: asyncHandler(async (req, res) => ok(res, await recurringService.list(req.user))),

  get: asyncHandler(async (req, res) => ok(res, await recurringService.find(req.user, req.params.id))),

  create: asyncHandler(async (req, res) => {
    const rule = await recurringService.create(req.user, req.body);
    await audit(req, { action: 'recurring.create', entity: 'recurring_rule', entityId: rule.id, after: briefRule(rule) });
    created(res, rule);
  }),

  update: asyncHandler(async (req, res) => {
    const { before, after } = await recurringService.update(req.user, req.params.id, req.body);
    await audit(req, { action: 'recurring.update', entity: 'recurring_rule', entityId: after.id, before: briefRule(before), after: briefRule(after) });
    ok(res, after);
  }),

  remove: asyncHandler(async (req, res) => {
    const before = await recurringService.remove(req.user, req.params.id);
    await audit(req, { action: 'recurring.delete', entity: 'recurring_rule', entityId: before.id, before: briefRule(before) });
    noContent(res);
  }),

  /** 201 لو اتسجّلت دلوقتي، و200 بنفس العملية لو المعاد كان متسجّل (ضغطة مكرّرة) */
  post: asyncHandler(async (req, res) => {
    const { rule, due_on: dueOn, transaction: tx, already_posted: already } = await recurringService.post(req.user, req.params.id, req.body);
    if (!already) {
      await audit(req, { action: 'transaction.create', entity: 'transaction', entityId: tx.id, after: briefTransaction(tx) });
      await audit(req, { action: 'recurring.post', entity: 'recurring_rule', entityId: rule.id, after: { name: rule.name, due_on: dueOn, transaction_id: tx.id, amount_minor: tx.amount_minor } });
    }
    const body = { due_on: dueOn, already_posted: already, transaction: tx };
    return already ? ok(res, body) : created(res, body);
  }),

  skip: asyncHandler(async (req, res) => {
    const { rule, due_on: dueOn, already_skipped: already } = await recurringService.skip(req.user, req.params.id, req.body);
    if (!already) await audit(req, { action: 'recurring.skip', entity: 'recurring_rule', entityId: rule.id, after: { name: rule.name, due_on: dueOn } });
    ok(res, { due_on: dueOn, already_skipped: already });
  }),
};
