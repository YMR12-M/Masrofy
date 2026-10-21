import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, created, noContent } from '../../utils/response.js';
import { audit } from '../../utils/audit.js';
import { briefTransaction } from '../recurring/recurring.service.js';
import { briefPlan, installmentsService } from './installments.service.js';

export const installmentsController = {
  list: asyncHandler(async (req, res) => ok(res, await installmentsService.list(req.user))),

  get: asyncHandler(async (req, res) => ok(res, await installmentsService.find(req.user, req.params.id))),

  create: asyncHandler(async (req, res) => {
    const plan = await installmentsService.create(req.user, req.body);
    await audit(req, { action: 'installment.create', entity: 'installment_plan', entityId: plan.id, after: briefPlan(plan) });
    created(res, plan);
  }),

  update: asyncHandler(async (req, res) => {
    const { before, after } = await installmentsService.update(req.user, req.params.id, req.body);
    await audit(req, { action: 'installment.update', entity: 'installment_plan', entityId: after.id, before: briefPlan(before), after: briefPlan(after) });
    ok(res, after);
  }),

  remove: asyncHandler(async (req, res) => {
    const before = await installmentsService.remove(req.user, req.params.id);
    await audit(req, { action: 'installment.delete', entity: 'installment_plan', entityId: before.id, before: briefPlan(before) });
    noContent(res);
  }),

  /** 201 لو اتسجّل دلوقتي، و200 بنفس العملية لو القسط كان متسجّل (ضغطة مكرّرة) */
  pay: asyncHandler(async (req, res) => {
    const {
      plan, item, transaction: tx, already_paid: already,
    } = await installmentsService.pay(req.user, req.params.id, req.params.itemId, req.body);
    if (!already) {
      await audit(req, { action: 'transaction.create', entity: 'transaction', entityId: tx.id, after: briefTransaction(tx) });
      await audit(req, { action: 'installment.pay', entity: 'installment_plan', entityId: plan.id, after: { name: plan.name, seq: item.seq, due_on: item.due_on, transaction_id: tx.id, amount_minor: tx.amount_minor } });
    }
    const body = { item_id: item.id, already_paid: already, transaction: tx };
    return already ? ok(res, body) : created(res, body);
  }),

  settle: asyncHandler(async (req, res) => {
    const { plan, item, after } = await installmentsService.settle(req.user, req.params.id, req.params.itemId, req.body);
    await audit(req, {
      action: req.body.settled ? 'installment.settle' : 'installment.unsettle',
      entity: 'installment_plan',
      entityId: plan.id,
      after: { name: plan.name, seq: item.seq, due_on: item.due_on, amount_minor: item.amount_minor },
    });
    ok(res, after);
  }),
};
