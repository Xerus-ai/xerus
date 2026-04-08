// Environment loader — must be imported before any module that reads process.env
// Loads .env.local (default) or .env.production (when NODE_ENV=production)

import dotenv from 'dotenv';
import path from 'path';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, '..', '..', envFile) });
