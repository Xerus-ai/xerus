// Color utility functions for marble state management

export const MarbleStates = {
    IDLE: 'idle',
    LISTENING: 'listening', 
    STOPPING: 'stopping',
    TTS: 'tts'
};

export const StateColors = {
    [MarbleStates.IDLE]: {
        r: 0.42, g: 0.45, b: 0.5,      // Grey #6b7280
        hex: '#6b7280',
        name: 'Idle Grey'
    },
    [MarbleStates.LISTENING]: {
        r: 0.75, g: 0.75, b: 0.25,     // Bright yellow-green (HSL 60, 100%, 50%)
        hex: '#bfbf40',
        name: 'Listening Yellow-Green'
    },
    [MarbleStates.STOPPING]: {
        r: 0.94, g: 0.27, b: 0.27,     // Red #ef4444
        hex: '#ef4444',
        name: 'Stopping Red'
    },
    [MarbleStates.TTS]: {
        r: 0.45, g: 0.27, b: 0.94,     // Purple/Blue #7344f0
        hex: '#7344f0',
        name: 'TTS Purple'
    }
};

export class ColorInterpolator {
    constructor(initialState = MarbleStates.IDLE) {
        this.currentColor = { ...StateColors[initialState] };
        this.targetColor = { ...StateColors[initialState] };
        this.interpolationSpeed = 0.05;
    }

    setTargetState(state) {
        if (StateColors[state]) {
            this.targetColor = { ...StateColors[state] };
        }
    }

    setInterpolationSpeed(speed) {
        this.interpolationSpeed = Math.max(0.001, Math.min(1.0, speed));
    }

    update() {
        const speed = this.interpolationSpeed;
        
        this.currentColor.r += (this.targetColor.r - this.currentColor.r) * speed;
        this.currentColor.g += (this.targetColor.g - this.currentColor.g) * speed;
        this.currentColor.b += (this.targetColor.b - this.currentColor.b) * speed;
        
        return this.currentColor;
    }

    getCurrentColor() {
        return this.currentColor;
    }

    getTargetColor() {
        return this.targetColor;
    }

    isTransitionComplete(threshold = 0.01) {
        const rDiff = Math.abs(this.targetColor.r - this.currentColor.r);
        const gDiff = Math.abs(this.targetColor.g - this.currentColor.g);
        const bDiff = Math.abs(this.targetColor.b - this.currentColor.b);
        
        return rDiff < threshold && gDiff < threshold && bDiff < threshold;
    }

    // Utility function to convert RGB to Three.js Vector3
    toThreeVector3() {
        return {
            x: this.currentColor.r,
            y: this.currentColor.g,
            z: this.currentColor.b
        };
    }

    // Utility function to get CSS color string
    toCSSColor() {
        const r = Math.round(this.currentColor.r * 255);
        const g = Math.round(this.currentColor.g * 255);
        const b = Math.round(this.currentColor.b * 255);
        return `rgb(${r}, ${g}, ${b})`;
    }

    // Create a smooth pulse effect for transitions
    createPulseEffect(duration = 1000) {
        const startTime = Date.now();
        const originalSpeed = this.interpolationSpeed;
        
        const pulse = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Create a pulse curve (fast -> slow -> fast)
            const pulseCurve = 1 - Math.cos(progress * Math.PI * 2) * 0.5;
            this.interpolationSpeed = originalSpeed * (0.5 + pulseCurve * 1.5);
            
            if (progress < 1) {
                requestAnimationFrame(pulse);
            } else {
                this.interpolationSpeed = originalSpeed;
            }
        };
        
        pulse();
    }
}

// Utility function to create gradient effects
export function createGradientEffect(color1, color2, factor) {
    return {
        r: color1.r + (color2.r - color1.r) * factor,
        g: color1.g + (color2.g - color1.g) * factor,
        b: color1.b + (color2.b - color1.b) * factor
    };
}

// Utility function to add subtle variations to colors
export function addColorVariation(color, variation = 0.1) {
    return {
        r: Math.max(0, Math.min(1, color.r + (Math.random() - 0.5) * variation)),
        g: Math.max(0, Math.min(1, color.g + (Math.random() - 0.5) * variation)),
        b: Math.max(0, Math.min(1, color.b + (Math.random() - 0.5) * variation))
    };
}