import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticate, authenticateLoose } from '../../middleware/authenticate.js';
import { loginLimiter, passwordResetLimiter, signupLimiter } from '../../middleware/rateLimiters.js';
import { authController as c } from './auth.controller.js';
import {
  registerSchema, loginSchema, refreshSchema, changePasswordSchema, forgotPasswordSchema,
  resetPasswordSchema, updateProfileSchema, sessionParams,
} from './auth.validation.js';

const router = Router();

// ما تحتاجه شاشة الدخول قبل أي جلسة (هل نعرض «حساب جديد»؟)
router.get('/options', c.options);

router.post('/register', signupLimiter, validate({ body: registerSchema }), c.register);
router.post('/login', loginLimiter, validate({ body: loginSchema }), c.login);
router.post('/refresh', validate({ body: refreshSchema }), c.refresh);
router.post('/logout', validate({ body: refreshSchema }), c.logout);
router.post('/logout-all', authenticate, c.logoutAll);

router.post('/forgot-password', passwordResetLimiter, validate({ body: forgotPasswordSchema }), c.forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate({ body: resetPasswordSchema }), c.resetPassword);

// me وتغيير الكلمة يعملان حتى لو الحساب مطلوب منه تغيير كلمة مرور مؤقتة
router.get('/me', authenticateLoose, c.me);
router.patch('/me', authenticate, validate({ body: updateProfileSchema }), c.updateProfile);
router.post('/change-password', authenticateLoose, validate({ body: changePasswordSchema }), c.changePassword);

router.get('/sessions', authenticate, c.listSessions);
router.delete('/sessions/:familyId', authenticate, validate({ params: sessionParams }), c.revokeSession);

export default router;
