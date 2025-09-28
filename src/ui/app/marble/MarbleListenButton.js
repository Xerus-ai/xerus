import { LitElement, html, css } from '../../assets/lit-core-2.7.4.min.js';
import { ColorInterpolator, MarbleStates, StateColors } from './utils/colorUtils.js';
import { MarbleAnimator, AnimationPerformanceMonitor } from './utils/animationUtils.js';
import * as THREE from 'three';

export class MarbleListenButton extends LitElement {
    static styles = css`
        :host {
            display: inline-block;
            width: 40px;
            height: 40px;
            cursor: pointer;
            -webkit-app-region: no-drag; /* Prevent header drag from interfering with clicks */
        }
        
        .marble-container {
            width: 100%;
            height: 100%;
            position: relative;
            border-radius: 50%;
            overflow: hidden;
            pointer-events: auto;
            z-index: 10;
        }
        
        .marble-canvas {
            width: 100%;
            height: 100%;
            display: block;
            border-radius: 50%;
            pointer-events: none; /* Make canvas non-interactive so clicks go to container */
        }
        
        .fallback-button {
            width: 100%;
            height: 100%;
            border: none;
            background: var(--interactive-secondary, #6b7280);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .fallback-button:hover {
            background: var(--interactive-secondary-hover, #4b5563);
            transform: scale(1.05);
        }
        
        .fallback-button.listening {
            background: #10b981;
        }
        
        .fallback-button.stopping {
            background: #ef4444;
        }
    `;

    static properties = {
        state: { type: String }, // 'idle', 'listening', 'stopping', 'tts'
        disabled: { type: Boolean },
        ttsEnabled: { type: Boolean }
    };

    constructor() {
        super();
        this.state = MarbleStates.IDLE;
        this.disabled = false;
        this.ttsEnabled = localStorage.getItem('xerus_tts_enabled') === 'true';
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.marble = null;
        this.material = null;
        this.isWebGLSupported = this.checkWebGLSupport();
        
        // Initialize utility classes
        this.colorInterpolator = new ColorInterpolator(MarbleStates.IDLE);
        this.animator = new MarbleAnimator();
        this.performanceMonitor = new AnimationPerformanceMonitor();
        
        // Shader uniforms will be initialized after THREE.js loads
        this.uniforms = null;
        
        // Double-click handling
        this.clickTimeout = null;
        this.clickCount = 0;
        this.doubleClickDelay = 300; // ms
        
        // Bind methods
        this.handleResize = this.handleResize.bind(this);
        this.handlePerformanceIssue = this.handlePerformanceIssue.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
    }

    checkWebGLSupport() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return !!gl;
        } catch (e) {
            return false;
        }
    }


    async firstUpdated() {
        super.firstUpdated();
        
        if (!this.isWebGLSupported) {
            console.warn('WebGL not supported, using fallback button');
            return;
        }

        try {
            console.log('[MarbleListenButton] Three.js imported via npm');
            this.initializeUniforms();
            await this.initializeMarble();
            this.startAnimation();
            
            // Set up performance monitoring
            this.performanceMonitor.onLowFPS(this.handlePerformanceIssue);
            
            // Add resize listener
            window.addEventListener('resize', this.handleResize);
        } catch (error) {
            console.error('Failed to initialize marble:', error);
            // Fallback to simple button will be shown automatically
        }
    }

    initializeUniforms() {
        // Initialize shader uniforms after THREE.js is loaded
        this.uniforms = {
            time: { value: 0.0 },
            marbleColor: { value: new THREE.Vector3(0.42, 0.45, 0.5) },
            cameraPosition: { value: new THREE.Vector3() },
            opacity: { value: 0.9 },
            metalness: { value: 0.1 },
            roughness: { value: 0.2 },
            deformationStrength: { value: 0.1 }
        };
    }

    async createMarbleMaterial() {
        let heightMap, displacementMap;
        
        try {
            // Load noise textures
            const textureLoader = new THREE.TextureLoader();
            heightMap = await new Promise((resolve, reject) => {
                textureLoader.load('./../assets/noise.jpg', resolve, undefined, reject);
            });
            displacementMap = await new Promise((resolve, reject) => {
                textureLoader.load('./../assets/noise3D.jpg', resolve, undefined, reject);
            });
            
            // Configure textures like in the working demo
            heightMap.minFilter = displacementMap.minFilter = THREE.NearestFilter;
            displacementMap.wrapS = displacementMap.wrapT = THREE.RepeatWrapping;
            
            console.log('[MarbleListenButton] Textures loaded successfully');
        } catch (error) {
            console.warn('[MarbleListenButton] Failed to load textures, using fallback:', error);
            
            // Create fallback textures
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 256;
            const ctx = canvas.getContext('2d');
            
            // Create simple noise pattern
            const imageData = ctx.createImageData(256, 256);
            for (let i = 0; i < imageData.data.length; i += 4) {
                const noise = Math.random() * 255;
                imageData.data[i] = noise;     // R
                imageData.data[i + 1] = noise; // G  
                imageData.data[i + 2] = noise; // B
                imageData.data[i + 3] = 255;   // A
            }
            ctx.putImageData(imageData, 0, 0);
            
            heightMap = new THREE.CanvasTexture(canvas);
            displacementMap = new THREE.CanvasTexture(canvas);
            displacementMap.wrapS = displacementMap.wrapT = THREE.RepeatWrapping;
        }

        // Create marble uniforms for shader patching (matching working demo)
        const marbleUniforms = {
            time: { value: 0.0 },
            colorA: { value: new THREE.Color(0, 0, 0) }, // Black base like working demo  
            colorB: { value: new THREE.Color(0xff5f00) }, // Default orange interior color
            heightMap: { value: heightMap },
            displacementMap: { value: displacementMap },
            iterations: { value: 43 }, // Custom tuned for perfect interior patterns
            depth: { value: 0.90 }, // Increased depth for deeper interior patterns
            smoothing: { value: 0.09 }, // Custom tuned for perfect interior patterns
            displacement: { value: 0.039 } // Custom tuned for perfect interior patterns
        };

        // Create base material matching CodePen demo
        const material = new THREE.MeshStandardMaterial({
            color: StateColors[this.state],
            transparent: true,
            opacity: 0.9,
            roughness: 0.09, // Custom tuned for perfect surface reflection
            metalness: 0.1
        });

        // Add shader patching for marble effect
        material.onBeforeCompile = (shader) => {
            // Wire up uniforms
            shader.uniforms = { ...shader.uniforms, ...marbleUniforms };
            
            // Add to top of vertex shader
            shader.vertexShader = `
                varying vec3 v_pos;
                varying vec3 v_dir;
            ` + shader.vertexShader;

            // Assign values to varyings inside of main()
            shader.vertexShader = shader.vertexShader.replace(
                /void main\(\) {/,
                (match) => match + `
                v_dir = position - cameraPosition;
                v_pos = position;
                `
            );

            // Add to top of fragment shader (exact match to working demo)
            shader.fragmentShader = `
                #define FLIP vec2(1., -1.)
                
                uniform vec3 colorA;
                uniform vec3 colorB;
                uniform sampler2D heightMap;
                uniform sampler2D displacementMap;
                uniform int iterations;
                uniform float depth;
                uniform float smoothing;
                uniform float displacement;
                uniform float time;
                
                varying vec3 v_pos;
                varying vec3 v_dir;
            ` + shader.fragmentShader;

            // Add marble marching function above main() (exact match to working demo)
            shader.fragmentShader = shader.fragmentShader.replace(
                /void main\(\) {/,
                (match) => `
                /**
                 * @param p - Point to displace
                 * @param strength - How much the map can displace the point
                 * @returns Point with scrolling displacement applied
                 */
                vec3 displacePoint(vec3 p, float strength) {
                    vec2 uv = equirectUv(normalize(p));
                    vec2 scroll = vec2(time, 0.);
                    vec3 displacementA = texture2D(displacementMap, uv + scroll).rgb; // Upright
                    vec3 displacementB = texture2D(displacementMap, uv * FLIP - scroll).rgb; // Upside down
                    
                    // Center the range to [-0.5, 0.5], note the range of their sum is [-1, 1]
                    displacementA -= 0.5;
                    displacementB -= 0.5;
                    
                    return p + strength * (displacementA + displacementB);
                }
                
                /**
                 * @param rayOrigin - Point on sphere
                 * @param rayDir - Normalized ray direction
                 * @returns Diffuse RGB color
                 */
                vec3 marchMarble(vec3 rayOrigin, vec3 rayDir) {
                    float perIteration = 1. / float(iterations);
                    vec3 deltaRay = rayDir * perIteration * depth;

                    // Start deeper inside the sphere to emphasize center patterns
                    vec3 p = rayOrigin - (rayDir * depth * 0.5);
                    float totalVolume = 0.;

                    for (int i=0; i<48; ++i) {
                        if (i >= iterations) break;
                        
                        // Read heightmap from spherical direction of displaced ray position
                        vec3 displaced = displacePoint(p, displacement);
                        vec2 uv = equirectUv(normalize(displaced));
                        float heightMapVal = texture2D(heightMap, uv).r;

                        // Take a slice of the heightmap with center emphasis
                        float distanceFromCenter = length(p);
                        float centerWeight = 1.0 - smoothstep(0.0, 0.8, distanceFromCenter);
                        float cutoff = 1. - float(i) * perIteration;
                        float slice = smoothstep(cutoff, cutoff + smoothing, heightMapVal);
                        
                        // Weight patterns more heavily toward center
                        slice *= (1.0 + centerWeight * 2.0);

                        // Accumulate the volume and advance the ray forward one step
                        totalVolume += slice * perIteration;
                        p += deltaRay;
                    }
                    return mix(colorA, colorB, totalVolume);
                }
                ` + match
            );

            // Replace diffuse color calculation (exact match to working demo)
            shader.fragmentShader = shader.fragmentShader.replace(
                /vec4 diffuseColor.*;/,
                `
                vec3 rayDir = normalize(v_dir);
                vec3 rayOrigin = v_pos;
                
                vec3 rgb = marchMarble(rayOrigin, rayDir);
                vec4 diffuseColor = vec4(rgb, 1.);
                `
            );
        };

        // Store uniforms reference for animation updates
        this.marbleUniforms = marbleUniforms;
        
        return material;
    }

    handleResize() {
        if (this.renderer && this.camera) {
            this.renderer.setSize(40, 40);
        }
    }

    handlePerformanceIssue(fps) {
        console.warn(`Low FPS detected: ${fps}. Reducing marble quality.`);
        // Reduce quality for better performance
        if (this.marble && this.marble.geometry) {
            const lowQualityGeometry = new THREE.SphereGeometry(0.8, 32, 32);
            this.marble.geometry.dispose();
            this.marble.geometry = lowQualityGeometry;
        }
    }

    async initializeMarble() {
        const container = this.shadowRoot.querySelector('.marble-container');
        const canvas = this.shadowRoot.querySelector('.marble-canvas');
        
        if (!container || !canvas) {
            throw new Error('Container or canvas not found');
        }

        // Scene setup
        this.scene = new THREE.Scene();
        
        // Camera setup
        this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        this.camera.position.z = 2;
        
        // Renderer setup with proper color management like CodePen demo
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: canvas, 
            alpha: true, 
            antialias: true 
        });
        this.renderer.setSize(40, 40);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x000000, 0); // Transparent background
        
        // Add color management and tone mapping like CodePen demo
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        
        // Marble geometry - made bigger for better visibility
        const geometry = new THREE.SphereGeometry(1.2, 64, 64);
        
        // Create marble material with shader patching
        this.material = await this.createMarbleMaterial();
        
        this.marble = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.marble);
        
        // Lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
        
        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(-1, -1, 1);
        this.scene.add(pointLight);
    }

    startAnimation() {
        if (!this.renderer || !this.scene || !this.camera) return;
        
        this.animator.start();
        
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            
            if (this.marble) {
                // Update time for shaders
                const time = this.animator.getTime();
                
                // Update marble uniforms
                if (this.marbleUniforms) {
                    // Speed 0 - No time animation for static interior patterns
                    // this.marbleUniforms.time.value += 0.016 * 0; // Speed = 0
                    
                    // Set colorB using HSL like working demo for richer colors
                    const hsl = this.getStateHSL(this.state);
                    this.marbleUniforms.colorB.value.setHSL(hsl.h, hsl.s, hsl.l);
                    
                    // Apply HDR color boost for more vibrant colors (beyond [0,1] range)
                    this.marbleUniforms.colorB.value.multiplyScalar(1.5);
                }
                
                // Apply state-specific animations
                this.animator.getRotationForState(this.state, this.marble);
            }
            
            // Monitor performance
            this.performanceMonitor.update();
            
            this.renderer.render(this.scene, this.camera);
        };
        
        animate();
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        
        if (changedProperties.has('state')) {
            // Update color interpolator target
            this.colorInterpolator.setTargetState(this.state);
            
            // Create transition effect
            if (this.marble && this.animator) {
                this.animator.createStateTransition(this.marble, changedProperties.get('state'), this.state);
                this.colorInterpolator.createPulseEffect(800);
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
        
        // Cleanup animation systems
        if (this.animator) {
            this.animator.destroy();
        }
        
        // Cleanup Three.js resources
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        if (this.marble && this.marble.geometry) {
            this.marble.geometry.dispose();
        }
        
        if (this.material) {
            this.material.dispose();
        }
    }

    handleClick() {
        if (this.disabled) return;
        
        // Handle double-click detection
        this.clickCount++;
        
        if (this.clickCount === 1) {
            // Start waiting for potential second click
            this.clickTimeout = setTimeout(() => {
                // Single click - normal listen functionality
                this.performSingleClick();
                this.clickCount = 0;
            }, this.doubleClickDelay);
        } else if (this.clickCount === 2) {
            // Double click - toggle TTS mode
            clearTimeout(this.clickTimeout);
            this.handleDoubleClick();
            this.clickCount = 0;
        }
    }
    
    performSingleClick() {
        // Add click ripple effect
        if (this.marble && this.animator) {
            this.animator.createClickRipple(this.marble);
        }
        
        this.dispatchEvent(new CustomEvent('marble-click', {
            detail: { state: this.state },
            bubbles: true,
            composed: true
        }));
    }
    
    handleDoubleClick() {
        // Show brief purple flash to indicate TTS toggle (only visual feedback)
        const originalState = this.state;
        
        // Add double-click ripple effect with different animation
        if (this.marble && this.animator) {
            this.animator.createClickRipple(this.marble);
            // Add extra visual feedback for double-click
            setTimeout(() => {
                if (this.marble && this.animator) {
                    this.animator.createClickRipple(this.marble);
                }
            }, 100);
        }
        
        // Toggle TTS state
        this.ttsEnabled = !this.ttsEnabled;
        
        // Store TTS preference in localStorage
        try {
            localStorage.setItem('xerus_tts_enabled', this.ttsEnabled.toString());
        } catch (error) {
            console.warn('Failed to save TTS preference:', error);
        }
        
        // Emit TTS toggle event (MainHeader will handle agent mode activation)
        this.dispatchEvent(new CustomEvent('marble-tts-toggle', {
            detail: { 
                ttsEnabled: this.ttsEnabled,
                originalState: originalState
            },
            bubbles: true,
            composed: true
        }));
        
        console.log(`[AUDIO] TTS ${this.ttsEnabled ? 'enabled' : 'disabled'} via marble double-click`);
        
        // If we were idle and just enabled TTS, start listening session for agent mode
        if (originalState === 'idle' && this.ttsEnabled) {
            // Brief delay for TTS toggle to process, then start listening
            setTimeout(() => {
                this.performSingleClick();
            }, 100);
        }
        // Don't manipulate state here - let MainHeader handle the marble state based on session status and agent mode
    }

    // Add hover effects
    handleMouseEnter() {
        if (this.marble && this.animator) {
            this.animator.createHoverEffect(this.marble, true);
        }
    }

    handleMouseLeave() {
        if (this.marble && this.animator) {
            this.animator.createHoverEffect(this.marble, false);
        }
    }

    getStateHSL(state) {
        // HSL values for the 4 marble states
        const stateHSL = {
            [MarbleStates.IDLE]: { h: 22/360, s: 1.0, l: 0.5 },        // Orange #ff5f00 - Default/idle state
            [MarbleStates.LISTENING]: { h: 142/360, s: 0.64, l: 0.5 }, // Green #26d980 - Actively listening/recording
            [MarbleStates.STOPPING]: { h: 0/360, s: 0.69, l: 0.5 },    // Red #d92626 - Stop recording (clickable to end)
            [MarbleStates.TTS]: { h: 250/360, s: 0.7, l: 0.55 }        // Purple/Blue #7344f0 - TTS mode active
        };
        return stateHSL[state] || stateHSL[MarbleStates.IDLE];
    }

    render() {
        // Show fallback button if WebGL is not supported
        if (!this.isWebGLSupported) {
            return html`
                <div class="marble-container" @click=${this.handleClick}>
                    <button class="fallback-button ${this.state}" ?disabled=${this.disabled}>
                        ${this.state === 'listening' ? '🎤' : this.state === 'stopping' ? '⏹' : '🎙'}
                    </button>
                </div>
            `;
        }

        return html`
            <div class="marble-container" 
                 @click=${this.handleClick}
                 @mouseenter=${this.handleMouseEnter}
                 @mouseleave=${this.handleMouseLeave}
                 title="Click to listen, double-click to toggle agent voice">
                <canvas class="marble-canvas"></canvas>
            </div>
        `;
    }
}

customElements.define('marble-listen-button', MarbleListenButton);