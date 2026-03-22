// Puzzle Piece Canvas Renderer
// Draws puzzle piece avatars on an offscreen canvas and returns a data URL

import { PuzzleConfig, PuzzleColors, getPuzzleColors } from './puzzle-config';

const CANVAS_SIZE = 400;
const PIECE_SIZE = 280;
const TAB_SIZE = 40;

function drawPuzzlePath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    shape: number,
    tabSize: number,
): void {
    const r = shape >= 2 ? 20 : 8; // rounded vs sharp corners
    const half = size / 2;
    const tabH = tabSize;
    const tabW = tabSize * 0.8;

    ctx.beginPath();

    // Top edge with tab (bump out)
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + half - tabW, y);
    if (shape === 4) {
        // Minimal: flat top
        ctx.lineTo(x + half + tabW, y);
    } else {
        // Puzzle tab on top
        ctx.quadraticCurveTo(x + half - tabW, y - tabH, x + half, y - tabH);
        ctx.quadraticCurveTo(x + half + tabW, y - tabH, x + half + tabW, y);
    }
    ctx.lineTo(x + size - r, y);

    // Top-right corner
    ctx.arcTo(x + size, y, x + size, y + r, r);

    // Right edge with blank (indent)
    ctx.lineTo(x + size, y + half - tabW);
    if (shape === 3) {
        // Hexagonal: angular blank
        ctx.lineTo(x + size + tabH * 0.6, y + half);
        ctx.lineTo(x + size, y + half + tabW);
    } else if (shape !== 4) {
        ctx.quadraticCurveTo(x + size + tabH, y + half - tabW, x + size + tabH, y + half);
        ctx.quadraticCurveTo(x + size + tabH, y + half + tabW, x + size, y + half + tabW);
    } else {
        ctx.lineTo(x + size, y + half + tabW);
    }
    ctx.lineTo(x + size, y + size - r);

    // Bottom-right corner
    ctx.arcTo(x + size, y + size, x + size - r, y + size, r);

    // Bottom edge (flat)
    ctx.lineTo(x + r, y + size);

    // Bottom-left corner
    ctx.arcTo(x, y + size, x, y + size - r, r);

    // Left edge with blank (indent)
    ctx.lineTo(x, y + half + tabW);
    if (shape === 1) {
        // Interlocking: deeper blank
        ctx.quadraticCurveTo(x - tabH * 1.2, y + half + tabW, x - tabH * 1.2, y + half);
        ctx.quadraticCurveTo(x - tabH * 1.2, y + half - tabW, x, y + half - tabW);
    } else if (shape !== 4) {
        ctx.quadraticCurveTo(x - tabH, y + half + tabW, x - tabH, y + half);
        ctx.quadraticCurveTo(x - tabH, y + half - tabW, x, y + half - tabW);
    } else {
        ctx.lineTo(x, y + half - tabW);
    }
    ctx.lineTo(x, y + r);

    // Top-left corner
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function drawPattern(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    pattern: number,
    color: string,
): void {
    if (pattern === 0) return; // none

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    const step = 20;

    if (pattern === 1) {
        // Dots
        for (let dx = step; dx < size - step; dx += step) {
            for (let dy = step; dy < size - step; dy += step) {
                ctx.beginPath();
                ctx.arc(x + dx, y + dy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if (pattern === 2) {
        // Lines
        for (let dx = step; dx < size; dx += step) {
            ctx.beginPath();
            ctx.moveTo(x + dx, y + 10);
            ctx.lineTo(x + dx, y + size - 10);
            ctx.stroke();
        }
    } else if (pattern === 3) {
        // Grid
        for (let dx = step; dx < size; dx += step) {
            ctx.beginPath();
            ctx.moveTo(x + dx, y + 10);
            ctx.lineTo(x + dx, y + size - 10);
            ctx.stroke();
        }
        for (let dy = step; dy < size; dy += step) {
            ctx.beginPath();
            ctx.moveTo(x + 10, y + dy);
            ctx.lineTo(x + size - 10, y + dy);
            ctx.stroke();
        }
    }

    ctx.restore();
}

function drawAccent(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    accent: number,
    colors: PuzzleColors,
): void {
    if (accent === 0) return; // none

    if (accent === 1) {
        // Glow: soft radial gradient behind
        const grad = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.5);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.save();
        ctx.fillStyle = grad;
        ctx.fillRect(cx - size * 0.5, cy - size * 0.5, size, size);
        ctx.restore();
    } else if (accent === 2) {
        // Badge: small circle top-right
        ctx.save();
        ctx.fillStyle = colors.tab;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.arc(cx + size * 0.35, cy - size * 0.35, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    } else if (accent === 3) {
        // Spark: small diamond shapes
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        const sparkPositions = [
            [cx - size * 0.25, cy - size * 0.3],
            [cx + size * 0.3, cy + size * 0.2],
            [cx - size * 0.1, cy + size * 0.35],
        ];
        for (const [sx, sy] of sparkPositions) {
            ctx.beginPath();
            ctx.moveTo(sx, sy - 5);
            ctx.lineTo(sx + 3, sy);
            ctx.lineTo(sx, sy + 5);
            ctx.lineTo(sx - 3, sy);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

export function renderPuzzleToDataUrl(config: PuzzleConfig, size: number): string {
    const colors = getPuzzleColors(config);
    const offset = (CANVAS_SIZE - PIECE_SIZE) / 2;
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;

    const native = document.createElement('canvas');
    native.width = CANVAS_SIZE;
    native.height = CANVAS_SIZE;
    const ctx = native.getContext('2d');
    if (!ctx) return '';

    // Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 8;

    // Main puzzle piece shape
    drawPuzzlePath(ctx, offset, offset, PIECE_SIZE, config.shape, TAB_SIZE);
    ctx.fillStyle = colors.body;
    ctx.fill();
    ctx.restore();

    // Inner highlight
    ctx.save();
    drawPuzzlePath(ctx, offset, offset, PIECE_SIZE, config.shape, TAB_SIZE);
    ctx.clip();
    const grad = ctx.createLinearGradient(offset, offset, offset, offset + PIECE_SIZE);
    grad.addColorStop(0, 'rgba(255,255,255,0.25)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = grad;
    ctx.fillRect(offset - TAB_SIZE, offset - TAB_SIZE, PIECE_SIZE + TAB_SIZE * 2, PIECE_SIZE + TAB_SIZE * 2);
    ctx.restore();

    // Inner pattern (clipped to shape)
    ctx.save();
    drawPuzzlePath(ctx, offset, offset, PIECE_SIZE, config.shape, TAB_SIZE);
    ctx.clip();
    drawPattern(ctx, offset, offset, PIECE_SIZE, config.pattern, colors.inner);
    ctx.restore();

    // Accent
    drawAccent(ctx, cx, cy, PIECE_SIZE, config.accent, colors);

    // Scale to requested size
    if (size >= CANVAS_SIZE) {
        return native.toDataURL('image/png');
    }

    const output = document.createElement('canvas');
    output.width = size;
    output.height = size;
    const outCtx = output.getContext('2d');
    if (!outCtx) return native.toDataURL('image/png');

    outCtx.drawImage(native, 0, 0, size, size);
    return output.toDataURL('image/png');
}
