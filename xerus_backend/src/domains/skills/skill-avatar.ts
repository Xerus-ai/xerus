// Skill Puzzle Piece Avatar Generator
// Generates compact config strings for deterministic puzzle piece rendering
// Format: "puzzle:{palette}-{shape}-{pattern}-{accent}"
// Palette: c0-c14 (curated) or p0-p359 (hue-based)

import { randomInt } from 'crypto';

const CURATED_PALETTE_COUNT = 15;
const SHAPE_TYPES = 5;      // standard, interlocking, rounded, hexagonal, minimal
const PATTERN_TYPES = 4;     // none, dots, lines, grid
const ACCENT_TYPES = 4;      // none, glow, badge, spark
const CURATED_PROBABILITY = 0.6;

const PREFIX = 'puzzle:';

export function generatePuzzleConfig(): string {
    const useCurated = Math.random() < CURATED_PROBABILITY;

    const palette = useCurated
        ? `c${randomInt(CURATED_PALETTE_COUNT)}`
        : `p${randomInt(360)}`;

    const shape = randomInt(SHAPE_TYPES);
    const pattern = randomInt(PATTERN_TYPES);
    const accent = randomInt(ACCENT_TYPES);

    return `${PREFIX}${palette}-${shape}-${pattern}-${accent}`;
}

export function isPuzzleConfig(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
}
