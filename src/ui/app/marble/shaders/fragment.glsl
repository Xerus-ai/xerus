// Simple WebGL-compatible fragment shader for marble effect
precision highp float;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;

uniform float time;
uniform vec3 marbleColor;
uniform vec3 cameraPosition;
uniform float opacity;

// Simple noise function for WebGL compatibility
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    
    // Create simple marble pattern
    float pattern = noise(vUv * 8.0 + time * 0.1);
    pattern += noise(vUv * 16.0 + time * 0.05) * 0.5;
    
    // Apply pattern to marble color
    vec3 finalColor = marbleColor + vec3(pattern * 0.3);
    
    // Simple fresnel effect
    float fresnel = 1.0 - dot(viewDirection, normal);
    fresnel = pow(fresnel, 2.0);
    
    // Add rim lighting
    finalColor += vec3(fresnel * 0.2);
    
    gl_FragColor = vec4(finalColor, opacity);
}