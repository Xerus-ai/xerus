// Environment loader — must be imported before any module that reads process.env
// Tries .env.production (NODE_ENV=production) or .env.local first; falls back
// to .env so deployments that only ship a single canonical .env still load.
// Existing process.env vars always win — dotenv does not override by default.

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const primary = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
const candidates = [primary, '.env'];

for (const file of candidates) {
    const fullPath = path.join(root, file);
    if (fs.existsSync(fullPath)) {
        dotenv.config({ path: fullPath });
        break;
    }
}
