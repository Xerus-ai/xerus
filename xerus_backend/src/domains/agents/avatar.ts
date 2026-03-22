// Agent Mascot Avatar Generator
// Generates compact config strings for deterministic mascot rendering
// Format: "mascot:c{palette}-{antenna}-{eyes}-{widthOffset}-{radiusOffset}"
//         "mascot:p{hue}-{antenna}-{eyes}-{widthOffset}-{radiusOffset}"

import { randomInt } from 'crypto';

const CURATED_PALETTE_COUNT = 20;
const ANTENNA_TYPES = 6;
const EYE_STYLES = 4;
const MAX_WIDTH_OFFSET = 60;
const MAX_RADIUS_OFFSET = 20;
const CURATED_PROBABILITY = 0.6;

const PREFIX = 'mascot:';

export function generateMascotConfig(): string {
    const useCurated = Math.random() < CURATED_PROBABILITY;

    const palettePrefix = useCurated
        ? `c${randomInt(CURATED_PALETTE_COUNT)}`
        : `p${randomInt(360)}`;

    const antenna = randomInt(ANTENNA_TYPES);
    const eyes = randomInt(EYE_STYLES);
    const widthOffset = randomInt(MAX_WIDTH_OFFSET + 1);
    const radiusOffset = randomInt(MAX_RADIUS_OFFSET + 1);

    return `${PREFIX}${palettePrefix}-${antenna}-${eyes}-${widthOffset}-${radiusOffset}`;
}

export function isMascotConfig(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
}
