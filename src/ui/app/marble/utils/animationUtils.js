// Animation utility functions for marble effects

export class MarbleAnimator {
    constructor() {
        this.time = 0;
        this.rotationSpeed = { x: 0, y: 0.002 }; // Much slower, only Y-axis like OrbitControls autoRotate
        this.deformationStrength = 0.1;
        this.isAnimating = false;
        this.animationId = null;
        this.startTime = Date.now();
    }

    start() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.startTime = Date.now();
        this.animate();
    }

    stop() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    animate() {
        if (!this.isAnimating) return;
        
        this.time = (Date.now() - this.startTime) * 0.001; // Convert to seconds
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    getTime() {
        return this.time;
    }

    // Create gentle rotation like OrbitControls autoRotate
    getRotationForState(state, marble) {
        if (!marble) return;

        // Simple, consistent Y-axis rotation for all states (like autoRotate)
        // Very subtle left-to-right movement
        marble.rotation.y += this.rotationSpeed.y;
    }

    // Create click ripple effect
    createClickRipple(marble, duration = 500) {
        const startTime = Date.now();
        const originalScale = marble.scale.x;
        
        const ripple = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Create ripple wave (expand and contract)
            const wave = Math.sin(progress * Math.PI * 3) * 0.1;
            const scale = originalScale + wave;
            
            marble.scale.set(scale, scale, scale);
            
            if (progress < 1) {
                requestAnimationFrame(ripple);
            } else {
                marble.scale.set(originalScale, originalScale, originalScale);
            }
        };
        
        ripple();
    }

    // Create state transition effect
    createStateTransition(marble, fromState, toState, duration = 800) {
        const startTime = Date.now();
        
        const transition = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Different transition effects based on state change
            if (toState === 'listening') {
                // Energetic expansion
                const expansion = Math.sin(progress * Math.PI) * 0.15;
                marble.scale.set(1 + expansion, 1 + expansion, 1 + expansion);
            } else if (toState === 'stopping') {
                // Gentle pulsing
                const pulse = Math.sin(progress * Math.PI * 2) * 0.1;
                marble.scale.set(1 + pulse, 1 + pulse, 1 + pulse);
            } else {
                // Return to normal
                const ease = this.easeOutElastic(progress);
                marble.scale.set(ease, ease, ease);
            }
            
            if (progress < 1) {
                requestAnimationFrame(transition);
            } else {
                marble.scale.set(1, 1, 1);
            }
        };
        
        transition();
    }

    // Create hover effect
    createHoverEffect(marble, isHovering, duration = 200) {
        const startTime = Date.now();
        const targetScale = isHovering ? 1.1 : 1.0;
        const startScale = marble.scale.x;
        
        const hover = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const eased = this.easeOutCubic(progress);
            const scale = startScale + (targetScale - startScale) * eased;
            
            marble.scale.set(scale, scale, scale);
            
            if (progress < 1) {
                requestAnimationFrame(hover);
            }
        };
        
        hover();
    }

    // Create loading/preparing animation
    createLoadingAnimation(marble) {
        const animate = () => {
            if (!this.isAnimating) return;
            
            const pulse = Math.sin(this.time * 4) * 0.05 + 1;
            marble.scale.set(pulse, pulse, pulse);
            
            // Gentle wobble
            marble.rotation.z = Math.sin(this.time * 2) * 0.1;
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    // Easing functions
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    easeOutElastic(t) {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Update deformation strength based on state
    getDeformationStrength(state) {
        switch (state) {
            case 'idle':
                return 0.05;
            case 'listening':
                return 0.15;
            case 'stopping':
                return 0.08;
            default:
                return 0.1;
        }
    }

    // Cleanup
    destroy() {
        this.stop();
        this.time = 0;
    }
}

// Utility function to create smooth value transitions
export function createValueTransition(startValue, endValue, duration, easing = 'easeOutCubic') {
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            let easedProgress;
            switch (easing) {
                case 'linear':
                    easedProgress = progress;
                    break;
                case 'easeOutCubic':
                    easedProgress = 1 - Math.pow(1 - progress, 3);
                    break;
                case 'easeInOutCubic':
                    easedProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                    break;
                default:
                    easedProgress = progress;
            }
            
            const currentValue = startValue + (endValue - startValue) * easedProgress;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
                return currentValue;
            } else {
                resolve(endValue);
                return endValue;
            }
        };
        
        animate();
    });
}

// Performance monitoring for animations
export class AnimationPerformanceMonitor {
    constructor() {
        this.frameCount = 0;
        this.lastTime = Date.now();
        this.fps = 60;
        this.lowFPSThreshold = 30;
        this.callbacks = [];
    }

    update() {
        this.frameCount++;
        const currentTime = Date.now();
        
        if (currentTime - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = currentTime;
            
            if (this.fps < this.lowFPSThreshold) {
                this.callbacks.forEach(callback => callback(this.fps));
            }
        }
    }

    onLowFPS(callback) {
        this.callbacks.push(callback);
    }

    getFPS() {
        return this.fps;
    }
}