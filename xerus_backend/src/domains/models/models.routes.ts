// Models API Routes
// GET /api/v1/models — returns available models from registry
// GET /api/v1/models?featured=true — returns only curated/featured models

import { Router, Request, Response, NextFunction } from 'express';
import { listModels, listFeaturedModels, getModel } from './model-registry.service';
import { authenticateFirebaseToken } from '../../middleware/auth';

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/models — list models (optionally filtered by ?featured=true)
router.get('/', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const featured = req.query.featured === 'true';
        const models = featured ? await listFeaturedModels() : await listModels();
        res.json({ success: true, data: models });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/models/:provider/:modelName — get single model by ID
router.get('/:provider/:modelName', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const modelId = `${req.params.provider}/${req.params.modelName}`;
        const model = await getModel(modelId);

        if (!model) {
            res.status(404).json({
                success: false,
                error: { code: 'MODEL_NOT_FOUND', message: `Model "${modelId}" not found` },
            });
            return;
        }

        res.json({ success: true, data: model });
    } catch (err) {
        next(err);
    }
});

export default router;
