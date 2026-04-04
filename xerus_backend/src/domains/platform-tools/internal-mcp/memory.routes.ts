// Memory Operations Routes
// Handles query_memory and analyze_memory_patterns MCP tools

import { Router, Response, NextFunction } from 'express';
import { getMemoryService } from '../platform/tools/memory.tools';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const router = Router();

// POST /api/v1/internal/mcp/query_memory
router.post('/query_memory', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { query: searchQuery, scope, scope_id, memory_type, limit } = req.body;
        const userId = req.sandbox!.userId;

        if (!searchQuery) {
            throw new BadRequestError('query is required');
        }

        const memoryService = getMemoryService();
        const result = await memoryService.queryMemory(userId, {
            query: searchQuery,
            scope: scope || 'company',
            scopeId: scope_id,
            memoryType: memory_type,
            limit: limit || 10,
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: result,
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/analyze_memory_patterns
router.post('/analyze_memory_patterns', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { scope, scope_id, categories } = req.body;
        const userId = req.sandbox!.userId;

        const memoryService = getMemoryService();
        const result = await memoryService.analyzeMemoryPatterns(userId, {
            scope: scope || 'company',
            scopeId: scope_id,
            categories,
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: result,
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as memoryRoutes };
