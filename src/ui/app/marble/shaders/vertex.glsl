// Simple WebGL-compatible vertex shader for marble effect
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;

uniform float time;
uniform float deformationStrength;

// Simple noise function for vertex displacement
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
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    // Add subtle noise-based deformation
    vec3 pos = position;
    float displacement = noise(uv * 4.0 + time * 0.5) * deformationStrength;
    pos += normal * displacement * 0.1;
    
    vPosition = pos;
    
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}