// Mascot Canvas Renderer
// Draws robot mascot avatars on an offscreen canvas and returns a data URL
// Ported from the mascot generator HTML prototype

import { MascotConfig, MascotColors, getMascotColors } from './mascot-config';

// Native canvas dimensions for drawing
const CANVAS_W = 500;
const CANVAS_H = 500;

// Base body dimensions
const BASE_BODY_WIDTH = 260;
const BASE_RADIUS = 12;

interface RectOptions {
    depth?: number;
    radius?: number;
}

function drawModernRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    opts: RectOptions = {}
): void {
    const { depth = 0, radius = 0 } = opts;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8 + depth;
    ctx.shadowOffsetX = 4 + depth * 0.4;
    ctx.shadowOffsetY = 8 + depth * 0.6;

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Inner highlight gradient
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, w - 6, h - 6, radius);
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, 'rgba(255,255,255,0.28)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
}

function drawAntennas(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    type: number,
    colors: MascotColors,
    r: number
): void {
    const aX = 110;
    const aY = 155;
    const cr = r * 0.5;

    switch (type) {
        case 0:
            drawModernRect(ctx, cx - aX, cy - aY, 45, 45, colors.body, { depth: 2, radius: cr });
            drawModernRect(ctx, cx + aX - 45, cy - aY, 45, 45, colors.body, { depth: 2, radius: cr });
            break;
        case 1:
            drawModernRect(ctx, cx - 95, cy - aY - 20, 30, 65, colors.body, { depth: 2, radius: cr });
            drawModernRect(ctx, cx + 65, cy - aY - 20, 30, 65, colors.body, { depth: 2, radius: cr });
            break;
        case 2:
            drawModernRect(ctx, cx - 135, cy - 135, 65, 30, colors.body, { depth: 2, radius: cr });
            drawModernRect(ctx, cx + 70, cy - 135, 65, 30, colors.body, { depth: 2, radius: cr });
            break;
        case 3:
            drawModernRect(ctx, cx - 100, cy - 190, 20, 90, colors.body, { depth: 2, radius: 4 });
            drawModernRect(ctx, cx + 80, cy - 190, 20, 90, colors.body, { depth: 2, radius: 4 });
            break;
        case 4:
            drawModernRect(ctx, cx - 30, cy - 190, 60, 60, colors.body, { depth: 2, radius: 30 });
            break;
        default:
            drawModernRect(ctx, cx - 120, cy - 140, 30, 30, colors.body, { depth: 2, radius: 15 });
            drawModernRect(ctx, cx + 90, cy - 140, 30, 30, colors.body, { depth: 2, radius: 15 });
            break;
    }
}

function drawLimbs(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    colors: MascotColors,
    bodyWidth: number
): void {
    // Feet
    drawModernRect(ctx, cx - 85, cy + 90, 50, 50, colors.limbs, { depth: 1, radius: 12 });
    drawModernRect(ctx, cx + 35, cy + 90, 50, 50, colors.limbs, { depth: 1, radius: 12 });

    // Arms
    const sw = 45;
    drawModernRect(ctx, cx - (bodyWidth / 2 + sw), cy - 10, sw, 60, colors.limbs, { depth: 1, radius: 12 });
    drawModernRect(ctx, cx + bodyWidth / 2, cy - 10, sw, 60, colors.limbs, { depth: 1, radius: 12 });
}

function drawBody(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    colors: MascotColors,
    bodyWidth: number,
    radius: number
): void {
    drawModernRect(ctx, cx - bodyWidth / 2, cy - 110, bodyWidth, 220, colors.body, { depth: 10, radius });
}

function drawEyePlate(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    colors: MascotColors,
    radius: number
): void {
    drawModernRect(ctx, cx - 90, cy - 85, 180, 145, colors.plate, { depth: 15, radius: radius * 0.8 });
}

function drawEyes(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    style: number
): void {
    const eyeColor = '#1e293b';
    let ew = 75;
    let eh = 85;

    if (style === 1) { ew = 35; eh = 75; }
    if (style === 2) { ew = 95; eh = 35; }
    if (style === 3) { ew = 110; eh = 100; }

    if (style === 1) {
        // Narrow vertical eyes
        drawModernRect(ctx, cx - 60, cy - 50, ew, eh, eyeColor, { depth: 20, radius: 6 });
        drawModernRect(ctx, cx + 25, cy - 50, ew, eh, eyeColor, { depth: 20, radius: 6 });
    } else {
        // Single visor or wide eye
        drawModernRect(ctx, cx - ew / 2, cy - 55, ew, eh, eyeColor, { depth: 20, radius: 10 });
        // Highlight reflection
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.85;
        ctx.fillRect(cx - ew / 2 + 10, cy - 45, ew / 3, ew / 3);
        ctx.restore();
    }
}

function drawTexture(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    ctx.globalAlpha = 0.03;
    for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
    }
    ctx.restore();
}

export function renderMascotToDataUrl(config: MascotConfig, size: number): string {
    const colors = getMascotColors(config);
    const bodyWidth = BASE_BODY_WIDTH + config.bodyWidthOffset;
    const radius = BASE_RADIUS + config.radiusOffset;
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2 + 20;

    // Draw at native resolution
    const native = document.createElement('canvas');
    native.width = CANVAS_W;
    native.height = CANVAS_H;
    const ctx = native.getContext('2d');
    if (!ctx) return '';

    // Draw all parts in layer order
    drawAntennas(ctx, cx, cy, config.antennaType, colors, radius);
    drawLimbs(ctx, cx, cy, colors, bodyWidth);
    drawBody(ctx, cx, cy, colors, bodyWidth, radius);
    drawEyePlate(ctx, cx, cy, colors, radius);
    drawEyes(ctx, cx, cy, config.eyeStyle);
    drawTexture(ctx, CANVAS_W, CANVAS_H);

    // Scale to requested size
    if (size >= CANVAS_W) {
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
