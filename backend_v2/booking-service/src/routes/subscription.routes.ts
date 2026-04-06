/**
 * Subscription Routes — Discount Pass Model
 * All routes require authentication.
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../../../shared/validation';
import {
    CreateSubscriptionSchema,
    CancelSubscriptionSchema,
    UpgradeSubscriptionSchema,
    AddFamilyMemberSchema,
    RemoveFamilyMemberSchema,
} from '../../../shared/subscription';
import {
    createSubscription,
    cancelSubscription,
    upgradeSubscription,
    getSubscriptionStatus,
    addFamilyMember,
    removeFamilyMember,
    getCustomerPortal,
} from '../controllers/subscription.controller';

const router = Router();

// All subscription routes require authentication
router.use(authMiddleware);

// Subscription lifecycle
router.post('/create', validate({ body: CreateSubscriptionSchema }), createSubscription);
router.post('/cancel', validate({ body: CancelSubscriptionSchema }), cancelSubscription);
router.post('/upgrade', validate({ body: UpgradeSubscriptionSchema }), upgradeSubscription);
router.get('/status', getSubscriptionStatus);
router.get('/portal', getCustomerPortal);

// Family management (Premium only)
router.post('/family/add', validate({ body: AddFamilyMemberSchema }), addFamilyMember);
router.post('/family/remove', validate({ body: RemoveFamilyMemberSchema }), removeFamilyMember);

export default router;
