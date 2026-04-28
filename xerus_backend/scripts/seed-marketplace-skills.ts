#!/usr/bin/env ts-node
/**
 * Seed Marketplace Skills
 *
 * Reads specific skill folders from a source directory, inserts metadata into DB,
 * and uploads skill folders to the S3 marketplace bucket.
 *
 * Usage:
 *   npx ts-node scripts/seed-marketplace-skills.ts [source_dir]
 *
 * Processes only the SEED_SLUGS list below. To add more skills, add their slug.
 * Idempotent: uses INSERT ... ON CONFLICT to allow re-running.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

const _root = path.join(__dirname, '..');
const _envLocal = path.join(_root, '.env.local');
dotenv.config({ path: fsSync.existsSync(_envLocal) ? _envLocal : path.join(_root, '.env') });

// 31 curated skills across all categories. Add more slugs here to expand.
const SEED_SLUGS: Array<{ slug: string; category: SkillCategory }> = [
    // Content (6)
    { slug: 'blog-writer', category: 'content' },
    { slug: 'content-ideas-generator', category: 'content' },
    { slug: 'creative-thought-partner', category: 'content' },
    { slug: 'tweet-writer', category: 'content' },
    { slug: 'social-gen', category: 'content' },
    { slug: 'newsletter-creation-curation', category: 'content' },
    // Business (5)
    { slug: 'seo-optimizer', category: 'business' },
    { slug: 'linkedin-automation', category: 'business' },
    { slug: 'brand-analyzer', category: 'business' },
    { slug: 'research-company', category: 'business' },
    { slug: 'pitch-gen', category: 'business' },
    // Finance (3)
    { slug: 'stock-analysis', category: 'finance' },
    { slug: 'finance-tracker', category: 'finance' },
    { slug: 'invoice-generator', category: 'finance' },
    // Productivity (6)
    { slug: 'plan-my-day', category: 'productivity' },
    { slug: 'habit-tracker', category: 'productivity' },
    { slug: 'focus-deep-work', category: 'productivity' },
    { slug: 'morning-routine', category: 'productivity' },
    { slug: 'task-tracker', category: 'productivity' },
    { slug: 'procrastination-buster', category: 'productivity' },
    // Wellness (3)
    { slug: 'mindfulness-meditation', category: 'wellness' },
    { slug: 'workout-logger', category: 'wellness' },
    { slug: 'endurance-coach', category: 'wellness' },
    // Education (3)
    { slug: 'study-habits', category: 'education' },
    { slug: 'deep-research', category: 'education' },
    { slug: 'language-learning', category: 'education' },
    // Operations (3)
    { slug: 'daily-recap', category: 'operations' },
    { slug: 'weekly-synthesis', category: 'operations' },
    { slug: 'recruitment-automation', category: 'operations' },
    // Development (1) + Product (1)
    { slug: 'prd', category: 'operations' },
    { slug: 'email-template-gen', category: 'content' },
    // Skills with env requirements (for secrets testing)
    { slug: 'brave-search', category: 'development' },
    { slug: 'todoist', category: 'productivity' },
    { slug: 'canva-connect', category: 'content' },
    { slug: 'notion-skill', category: 'productivity' },
    { slug: 'openai-image-gen', category: 'content' },
];

type SkillCategory = 'productivity' | 'wellness' | 'business' | 'content' | 'finance' | 'education' | 'development' | 'operations';

async function main() {
    const { skillRepository } = await import('../src/domains/skills/repository');
    const { generatePuzzleConfig } = await import('../src/domains/skills/skill-avatar');
    const { StorageService } = await import('../src/domains/execution/storage/storage.service');
    const { testConnection } = await import('../src/database/connection');

    const sourceDir = process.argv[2] || 'D:\\openBot\\xerus\\xerushub_skills';
    const dryRun = process.argv.includes('--dry-run');

    console.log(`[Seed] Source: ${sourceDir}`);
    console.log(`[Seed] Skills to seed: ${SEED_SLUGS.length}`);
    console.log(`[Seed] Dry run: ${dryRun}`);

    await testConnection();
    console.log('[Seed] Database connected');

    let storage: InstanceType<typeof StorageService> | null = null;
    if (!dryRun) {
        storage = new StorageService({
            bucket: process.env.S3_MARKETPLACE_BUCKET || 'xerus-marketplace',
            region: process.env.S3_REGION || process.env.AWS_REGION || 'ap-southeast-1',
            accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        });
        console.log('[Seed] S3 storage initialized');
    }

    let seeded = 0;
    let errors = 0;

    for (const { slug, category } of SEED_SLUGS) {
        const folderPath = path.join(sourceDir, slug);

        try {
            const metaPath = path.join(folderPath, 'xerushub.json');
            const skillMdPath = path.join(folderPath, 'SKILL.md');

            const [hasMeta, hasSkillMd] = await Promise.all([
                fileExists(metaPath),
                fileExists(skillMdPath),
            ]);

            if (!hasMeta || !hasSkillMd) {
                console.warn(`[Seed] SKIP ${slug}: missing xerushub.json or SKILL.md`);
                continue;
            }

            const metaRaw = await fs.readFile(metaPath, 'utf-8');
            const meta = JSON.parse(metaRaw) as ClawdhubMeta;
            const fileCount = await countFiles(folderPath);

            await skillRepository.createSeeded({
                name: meta.displayName || slug,
                slug,
                description: meta.summary || '',
                category,
                tags: meta.tags || [],
                author: null,
                source_url: null,
                avatar_config: generatePuzzleConfig(),
                file_count: fileCount,
                version: meta.version || '1.0.0',
            });

            if (storage) {
                const uploaded = await uploadFolder(storage, folderPath, `skills/${slug}`);
                console.log(`[Seed] ${slug}: DB + S3 (${uploaded} files)`);
            } else {
                console.log(`[Seed] ${slug}: DB only (dry-run)`);
            }

            seeded++;
        } catch (err) {
            errors++;
            console.error(`[Seed] ERROR ${slug}:`, err);
        }
    }

    console.log(`\n[Seed] Done: ${seeded} seeded, ${errors} errors`);
    process.exit(errors > 0 ? 1 : 0);
}

interface ClawdhubMeta {
    slug: string;
    displayName: string;
    summary: string;
    tags: string[];
    stats: Record<string, number>;
    version: string;
    createdAt: number;
    updatedAt: number;
    syncedAt: number;
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function countFiles(dirPath: string): Promise<number> {
    let count = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isFile()) count++;
        else if (entry.isDirectory()) count += await countFiles(path.join(dirPath, entry.name));
    }
    return count;
}

async function uploadFolder(
    storage: { upload(key: string, content: Buffer | string, options?: { contentType?: string }): Promise<void> },
    localDir: string,
    s3Prefix: string,
): Promise<number> {
    let uploaded = 0;
    const entries = await fs.readdir(localDir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const localPath = path.join(localDir, entry.name);
        const s3Key = `${s3Prefix}/${entry.name}`;

        if (entry.isFile()) {
            const content = await fs.readFile(localPath);
            await storage.upload(s3Key, content, { contentType: getContentType(entry.name) });
            uploaded++;
        } else if (entry.isDirectory()) {
            uploaded += await uploadFolder(storage, localPath, s3Key);
        }
    }
    return uploaded;
}

function getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const types: Record<string, string> = {
        '.md': 'text/markdown', '.json': 'application/json', '.txt': 'text/plain',
        '.sh': 'text/x-shellscript', '.py': 'text/x-python', '.ts': 'text/typescript', '.js': 'text/javascript',
    };
    return types[ext] || 'application/octet-stream';
}

main().catch(err => {
    console.error('[Seed] Fatal:', err);
    process.exit(1);
});
