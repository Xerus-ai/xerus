import Joi from 'joi';

export const checkoutSchema = Joi.object({
    plan: Joi.string().valid('pro', 'max', 'ultra').required(),
    interval: Joi.string().valid('monthly', 'annual').required(),
});

export const creditCheckoutSchema = Joi.object({
    credits: Joi.number().valid(500, 2000, 5000).required(),
});

export const changePlanSchema = Joi.object({
    plan: Joi.string().valid('pro', 'max', 'ultra').required(),
    interval: Joi.string().valid('monthly', 'annual').required(),
});
