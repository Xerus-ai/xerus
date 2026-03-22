// Puzzle Piece Configuration Parser
// Decodes compact avatar config strings into renderable parameters
// Format: puzzle:{palette}-{shape}-{pattern}-{accent}

const PREFIX = 'puzzle:';

export interface PuzzleConfig {
    paletteMode: 'curated' | 'procedural';
    paletteIndex: number;
    shape: number;       // 0-4: standard, interlocking, rounded, hexagonal, minimal
    pattern: number;     // 0-3: none, dots, lines, grid
    accent: number;      // 0-3: none, glow, badge, spark
}

export interface PuzzleColors {
    body: string;
    tab: string;
    inner: string;
    bg: string;
}

// 15 curated palettes for puzzle pieces
const CURATED_PALETTES: PuzzleColors[] = [
    { body: '#6366f1', tab: '#818cf8', inner: '#e0e7ff', bg: '#eef2ff' },  // indigo
    { body: '#f97316', tab: '#fb923c', inner: '#ffedd5', bg: '#fff7ed' },  // orange
    { body: '#06b6d4', tab: '#22d3ee', inner: '#cffafe', bg: '#f0fdfa' },  // cyan
    { body: '#8b5cf6', tab: '#a78bfa', inner: '#f5f3ff', bg: '#faf5ff' },  // violet
    { body: '#10b981', tab: '#34d399', inner: '#d1fae5', bg: '#f0fdf4' },  // emerald
    { body: '#ef4444', tab: '#f87171', inner: '#fee2e2', bg: '#fef2f2' },  // red
    { body: '#f472b6', tab: '#f9a8d4', inner: '#fce7f3', bg: '#fdf2f8' },  // pink
    { body: '#fbbf24', tab: '#fcd34d', inner: '#fef3c7', bg: '#fffbeb' },  // amber
    { body: '#14b8a6', tab: '#2dd4bf', inner: '#ccfbf1', bg: '#f0fdfa' },  // teal
    { body: '#0ea5e9', tab: '#38bdf8', inner: '#e0f2fe', bg: '#f0f9ff' },  // sky
    { body: '#d946ef', tab: '#e879f9', inner: '#fae8ff', bg: '#fdf4ff' },  // fuchsia
    { body: '#84cc16', tab: '#a3e635', inner: '#ecfccb', bg: '#f7fee7' },  // lime
    { body: '#f43f5e', tab: '#fb7185', inner: '#ffe4e6', bg: '#fff1f2' },  // rose
    { body: '#7c3aed', tab: '#8b5cf6', inner: '#ede9fe', bg: '#f5f3ff' },  // purple
    { body: '#059669', tab: '#10b981', inner: '#d1fae5', bg: '#ecfdf5' },  // green
];

export function isPuzzleConfig(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
}

export function parsePuzzleConfig(encoded: string): PuzzleConfig | null {
    if (!encoded.startsWith(PREFIX)) return null;

    const payload = encoded.slice(PREFIX.length);
    const match = payload.match(/^([cp])(\d+)-(\d+)-(\d+)-(\d+)$/);
    if (!match) return null;

    const [, mode, index, shape, pattern, accent] = match;

    return {
        paletteMode: mode === 'c' ? 'curated' : 'procedural',
        paletteIndex: parseInt(index, 10),
        shape: parseInt(shape, 10),
        pattern: parseInt(pattern, 10),
        accent: parseInt(accent, 10),
    };
}

export function getPuzzleColors(config: PuzzleConfig): PuzzleColors {
    if (config.paletteMode === 'curated') {
        const index = config.paletteIndex % CURATED_PALETTES.length;
        return CURATED_PALETTES[index];
    }

    // Procedural: generate from HSL hue
    const h = config.paletteIndex % 360;
    const s = 60;
    const l = 50;
    return {
        body: `hsl(${h}, ${s}%, ${l}%)`,
        tab: `hsl(${h}, ${s - 10}%, ${l + 15}%)`,
        inner: `hsl(${h}, ${Math.round(s / 3)}%, 90%)`,
        bg: `hsl(${h}, ${Math.round(s / 4)}%, 96%)`,
    };
}
