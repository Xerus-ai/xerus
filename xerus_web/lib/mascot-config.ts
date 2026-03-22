// Mascot Configuration Parser
// Decodes compact avatar config strings into renderable parameters

const PREFIX = 'mascot:';

export interface MascotConfig {
    paletteMode: 'curated' | 'procedural';
    paletteIndex: number;
    antennaType: number;
    eyeStyle: number;
    bodyWidthOffset: number;
    radiusOffset: number;
}

export interface MascotColors {
    body: string;
    limbs: string;
    plate: string;
    bg: string;
}

// 20 curated palettes matching the mascot generator
const CURATED_PALETTES: MascotColors[] = [
    { body: '#f97316', limbs: '#fbbf24', plate: '#ffedd5', bg: '#fff7ed' },
    { body: '#06b6d4', limbs: '#22d3ee', plate: '#cffafe', bg: '#f0fdfa' },
    { body: '#8b5cf6', limbs: '#d946ef', plate: '#f5f3ff', bg: '#faf5ff' },
    { body: '#10b981', limbs: '#34d399', plate: '#d1fae5', bg: '#f0fdf4' },
    { body: '#ef4444', limbs: '#fca5a5', plate: '#fee2e2', bg: '#fef2f2' },
    { body: '#f472b6', limbs: '#fda4af', plate: '#fff1f2', bg: '#fff1f2' },
    { body: '#a78bfa', limbs: '#c4b5fd', plate: '#f5f3ff', bg: '#f5f3ff' },
    { body: '#fbbf24', limbs: '#fcd34d', plate: '#fffbeb', bg: '#fffbeb' },
    { body: '#94a3b8', limbs: '#cbd5e1', plate: '#f8fafc', bg: '#f8fafc' },
    { body: '#1e293b', limbs: '#475569', plate: '#94a3b8', bg: '#f1f5f9' },
    { body: '#4338ca', limbs: '#6366f1', plate: '#e0e7ff', bg: '#eef2ff' },
    { body: '#7c2d12', limbs: '#b45309', plate: '#ffedd5', bg: '#fff7ed' },
    { body: '#111827', limbs: '#374151', plate: '#6b7280', bg: '#f3f4f6' },
    { body: '#db2777', limbs: '#ec4899', plate: '#fce7f3', bg: '#fdf2f8' },
    { body: '#4ade80', limbs: '#a3e635', plate: '#f7fee7', bg: '#f7fee7' },
    { body: '#7e22ce', limbs: '#a855f7', plate: '#f3e8ff', bg: '#f3e8ff' },
    { body: '#0ea5e9', limbs: '#38bdf8', plate: '#e0f2fe', bg: '#f0f9ff' },
    { body: '#f59e0b', limbs: '#fbbf24', plate: '#fef3c7', bg: '#fffbeb' },
    { body: '#64748b', limbs: '#94a3b8', plate: '#f1f5f9', bg: '#f8fafc' },
    { body: '#be123c', limbs: '#fb7185', plate: '#fff1f2', bg: '#fff1f2' },
];

export function isMascotConfig(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
}

export function parseMascotConfig(encoded: string): MascotConfig | null {
    if (!encoded.startsWith(PREFIX)) return null;

    const payload = encoded.slice(PREFIX.length);
    // Format: c5-2-1-30-15 or p180-2-1-30-15
    const match = payload.match(/^([cp])(\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/);
    if (!match) return null;

    const [, mode, index, antenna, eyes, width, radius] = match;

    return {
        paletteMode: mode === 'c' ? 'curated' : 'procedural',
        paletteIndex: parseInt(index, 10),
        antennaType: parseInt(antenna, 10),
        eyeStyle: parseInt(eyes, 10),
        bodyWidthOffset: parseInt(width, 10),
        radiusOffset: parseInt(radius, 10),
    };
}

export function getMascotColors(config: MascotConfig): MascotColors {
    if (config.paletteMode === 'curated') {
        const index = config.paletteIndex % CURATED_PALETTES.length;
        return CURATED_PALETTES[index];
    }

    // Procedural: generate from HSL hue
    const h = config.paletteIndex % 360;
    const s = 55;
    const l = 45;
    return {
        body: `hsl(${h}, ${s}%, ${l}%)`,
        limbs: `hsl(${(h + 30) % 360}, ${s - 10}%, ${l + 10}%)`,
        plate: `hsl(${h}, ${Math.round(s / 3)}%, 92%)`,
        bg: `hsl(${h}, ${Math.round(s / 4)}%, 97%)`,
    };
}
