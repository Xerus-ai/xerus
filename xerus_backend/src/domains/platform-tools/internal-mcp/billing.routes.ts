// Billing Routes
// Handles get_billing_status MCP tool

import { Router, Response, NextFunction } from 'express';
import { getBillingToolService } from '../platform/tools/billing.tools';
import { InternalMcpRequest, McpToolResult } from './types';

const router = Router();

// POST /api/v1/internal/mcp/get_billing_status
router.post('/get_billing_status', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.sandbox!.userId;

        const billingService = getBillingToolService();
        const result = await billingService.getBillingStatus(userId, {});

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                plan_type: result.plan_type,
                credits_available: result.credits_available,
                credits_used: result.credits_used,
                subscription_status: result.subscription_status,
                subscription_current_period_end: result.subscription_current_period_end,
                billing_email: result.billing_email,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as billingRoutes };
