import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import householdRoutes from '../modules/household/household.routes.js';
import memberRoutes from '../modules/members/members.routes.js';
import accountRoutes from '../modules/accounts/accounts.routes.js';
import categoryRoutes from '../modules/categories/categories.routes.js';
import transactionRoutes from '../modules/transactions/transactions.routes.js';
import budgetRoutes from '../modules/budgets/budgets.routes.js';
import recurringRoutes from '../modules/recurring/recurring.routes.js';
import installmentRoutes from '../modules/installments/installments.routes.js';
import billRoutes from '../modules/bills/bills.routes.js';
import reportRoutes from '../modules/reports/reports.routes.js';
import auditRoutes from '../modules/audit/audit.routes.js';

/**
 * كل المسارات تحت /api/v1. المستخدم ينتمي لأسرة واحدة، فلا معرّف أسرة
 * في الرابط: النطاق يُؤخذ دائمًا من `req.user.household_id`.
 */
const router = Router();

router.use('/auth', authRoutes);
router.use('/household', householdRoutes);
router.use('/members', memberRoutes);
router.use('/accounts', accountRoutes);
router.use('/categories', categoryRoutes);
router.use('/transactions', transactionRoutes);
router.use('/budgets', budgetRoutes);
router.use('/recurring', recurringRoutes);
router.use('/installments', installmentRoutes);
router.use('/bills', billRoutes);
router.use('/reports', reportRoutes);
router.use('/audit', auditRoutes);

export default router;
