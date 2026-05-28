/**
 * Solitude in the Swarm
 * Generative Audio-Visual Metaphor for Isolation
 */

// --- CONFIGURATION & STATE ---
const CONFIG = {
    // Canvas trails
    clearColor: 'rgba(5, 5, 8, 0.085)', // Lower opacity = longer trails
    
    // Physics parameters
    maxSpeed: 3.5,
    maxForce: 0.15,
    flockDistances: {
        separation: 25,
        alignment: 50,
        cohesion: 50
    },
    flockWeights: {
        separation: 1.8,
        alignment: 1.0,
        cohesion: 1.0
    },
    
    // Isolation settings
    playerRepulsionRadius: 130, // Distance at which boids flee the player
    playerRepulsionForce: 1.5,  // Strength of the escape steer
    
    // Aesthetic settings
    baseParticleRadius: 3.5,
    playerParticleRadius: 7,
    
    // Color Palettes
    palettes: {
        neon: {
            colors: ['#ff007f', '#7f00ff', '#00ffff'],
            ambientGlows: ['#ff007f', '#7f00ff'],
            background: '#050508'
        },
        sunset: {
            colors: ['#ff416c', '#ff4b2b', '#ffb300'],
            ambientGlows: ['#ff416c', '#b30000'],
            background: '#070404'
        },
        ocean: {
            colors: ['#00c6ff', '#0072ff', '#7f00ff'],
            ambientGlows: ['#00c6ff', '#7f00ff'],
            background: '#04050a'
        }
    }
};

const STATE = {
    audioEnabled: false,
    activePalette: 'neon',
    swarmSize: 150,
    swarmSpeed: 3.5,
    bondRadius: 85,
    isBlending: false,
    mouse: {
        x: null,
        y: null,
        targetX: null,
        targetY: null,
        active: false
    },
    boids: [],
    player: null,
    audioEngine: null,
    particles: [], // For the snap burst effects
    bonds: new Map(), // Tracks bending/snapping state of boid connections
    pulseWave: { // State of the call wave triggered on click
        active: false,
        position: null,
        radius: 0,
        maxRadius: 380,
        speed: 7,
        hitBoids: new Set()
    }
};

// --- VECTOR UTILITY CLASS ---
class Vector {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    
    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }
    
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }
    
    mult(n) {
        this.x *= n;
        this.y *= n;
        return this;
    }
    
    div(n) {
        if (n !== 0) {
            this.x /= n;
            this.y /= n;
        }
        return this;
    }
    
    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    
    magSq() {
        return this.x * this.x + this.y * this.y;
    }
    
    normalize() {
        const m = this.mag();
        if (m !== 0) this.div(m);
        return this;
    }
    
    limit(max) {
        if (this.magSq() > max * max) {
            this.normalize();
            this.mult(max);
        }
        return this;
    }
    
    dist(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    copy() {
        return new Vector(this.x, this.y);
    }
    
    static random2D() {
        const angle = Math.random() * Math.PI * 2;
        return new Vector(Math.cos(angle), Math.sin(angle));
    }
}

// --- PARTICLE EFFECT CLASS ---
class Particle {
    constructor(x, y, color) {
        this.position = new Vector(x, y);
        this.velocity = Vector.random2D().mult(Math.random() * 1.8 + 0.6);
        this.color = color;
        this.life = 1.0;
        this.decay = 0.02 + Math.random() * 0.03;
        this.size = Math.random() * 2.2 + 0.8;
    }
    
    update() {
        this.position.add(this.velocity);
        this.life -= this.decay;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = hexToRgba(this.color, this.life);
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// --- GENERATIVE AUDIO ENGINE ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
        this.delayNode = null;
        this.filterNode = null;
        this.droneOsc = null;
        this.droneGain = null;
        this.scale = [130.81, 146.83, 164.81, 196.00, 220.00, // C3 Pentatonic (C, D, E, G, A)
                      261.63, 293.66, 329.63, 392.00, 440.00, // C4
                      523.25, 587.33, 659.25, 783.99, 880.00]; // C5
    }
    
    init() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            
            // Nodes setup
            this.masterVolume = this.ctx.createGain();
            this.masterVolume.gain.setValueAtTime(0.12, this.ctx.currentTime); // Limit maximum overall volume
            
            this.filterNode = this.ctx.createBiquadFilter();
            this.filterNode.type = 'lowpass';
            this.filterNode.frequency.setValueAtTime(1200, this.ctx.currentTime);
            this.filterNode.Q.setValueAtTime(1, this.ctx.currentTime);
            
            // Stereo Delay Effect
            this.delayNode = this.ctx.createDelay();
            this.delayNode.delayTime.setValueAtTime(0.35, this.ctx.currentTime);
            this.delayFeedback = this.ctx.createGain();
            this.delayFeedback.gain.setValueAtTime(0.4, this.ctx.currentTime);
            
            // Connect delay loop
            this.delayNode.connect(this.delayFeedback);
            this.delayFeedback.connect(this.delayNode);
            
            // Master chain
            // Synth -> Filter -> Delay -> MasterVolume -> Destination
            // Synth -> Filter -> MasterVolume -> Destination (dry path)
            this.filterNode.connect(this.masterVolume);
            this.filterNode.connect(this.delayNode);
            this.delayNode.connect(this.masterVolume);
            this.masterVolume.connect(this.ctx.destination);
            
            // Ambient Low Drone (The Isolation hum)
            // Stays active in the background, intensifies when player is alone/unconformed
            this.droneOsc = this.ctx.createOscillator();
            this.droneOsc.type = 'sine';
            this.droneOsc.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2 (Low, comforting drone)
            
            this.droneGain = this.ctx.createGain();
            this.droneGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // Start silent
            
            this.droneOsc.connect(this.droneGain);
            this.droneGain.connect(this.masterVolume);
            this.droneOsc.start();
            
            // Resume context if suspended
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            
            return true;
        } catch (e) {
            console.error("Web Audio API not supported", e);
            return false;
        }
    }
    
    playTone(noteIndex, volume = 0.05) {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        if (volume <= 0.0001) return; // Prevent silent notes and range issues
        
        const now = this.ctx.currentTime;
        const freq = this.scale[noteIndex % this.scale.length];
        
        // Simple additive synth voice (Sine + Triangle helper)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, now);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 1.5, now); // Perfect fifth fifth harmonic helper
        
        gainNode.gain.setValueAtTime(0.0001, now);
        // Soft attack to prevent click, slow organic release
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.08);
        gainNode.gain.setTargetAtTime(0.0001, now + 0.08, 0.35); // Safe exponential decay
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.filterNode);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
    }
    
    playSnapTone(volume = 0.08) {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        const now = this.ctx.currentTime;
        const freq = 880.00; // A5 (Clear, high pitch pluck)
        
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.12); // Safe linear frequency sweep
        
        gainNode.gain.setValueAtTime(volume, now);
        gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.12); // Safe linear volume decay
        
        osc.connect(gainNode);
        gainNode.connect(this.masterVolume); // Play dry and immediately
        
        osc.start(now);
        osc.stop(now + 0.15);
    }
    
    playCallTone() {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        const now = this.ctx.currentTime;
        
        // Deep calling chord (F#1, C#2, F#2 mapping to the F# major scale base)
        const freqs = [46.25, 69.30, 92.50];
        
        freqs.forEach(freq => {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            
            gainNode.gain.setValueAtTime(0.0001, now);
            gainNode.gain.linearRampToValueAtTime(0.12, now + 0.2); // Slower swell
            gainNode.gain.setTargetAtTime(0.0001, now + 0.2, 0.65); // Warm decaying tail
            
            osc.connect(gainNode);
            gainNode.connect(this.filterNode);
            
            osc.start(now);
            osc.stop(now + 3.5);
        });
    }
    
    updateAudioState(playerVelocity, distanceToClosestBoid) {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        
        const now = this.ctx.currentTime;
        
        // Dynamic Filter Cutoff:
        // When player is close to boids, the filter is open.
        // If the nearest boid is far, we muffle the sound to symbolize distance/detachment.
        const maxDist = 300;
        const normDist = Math.min(distanceToClosestBoid, maxDist) / maxDist; // 0 to 1
        
        // Filter sweeps down when isolated
        const cutoffFreq = 1800 - (normDist * 1400); // 1800Hz down to 400Hz
        this.filterNode.frequency.setTargetAtTime(cutoffFreq, now, 0.2);
        
        // Drone intensity increases when the player is isolated (lonely hum)
        // Also shifts frequency slightly depending on mouse speed (anxiety)
        const droneVol = 0.01 + (normDist * 0.04); // Fades in as player gets isolated
        this.droneGain.gain.setTargetAtTime(droneVol, now, 0.3);
        
        const baseDroneFreq = 65.41; // C2
        const anxietyPitch = baseDroneFreq + (playerVelocity * 2.5);
        this.droneOsc.frequency.setTargetAtTime(anxietyPitch, now, 0.5);
    }
    
    setMasterVolume(val) {
        if (this.masterVolume) {
            this.masterVolume.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
        }
    }
    
    mute() {
        this.setMasterVolume(0);
    }
    
    unmute() {
        this.setMasterVolume(0.12);
    }
}

// --- PLAYER CLASS ---
class Player {
    constructor() {
        this.position = new Vector(window.innerWidth / 2, window.innerHeight / 2);
        this.velocity = new Vector(0, 0);
        this.radius = CONFIG.playerParticleRadius;
        this.pulsePhase = 0;
        this.pulseSpeed = 0.04;
        
        // Target coordinates for smooth easing
        this.targetX = window.innerWidth / 2;
        this.targetY = window.innerHeight / 2;
        this.active = false;
    }
    
    update() {
        // Smooth easing towards cursor (spring-like animation)
        const dx = this.targetX - this.position.x;
        const dy = this.targetY - this.position.y;
        
        // Calculate velocity based on difference (spring factor)
        const spring = 0.08;
        const friction = 0.85;
        
        const ax = dx * spring;
        const ay = dy * spring;
        
        this.velocity.x = (this.velocity.x + ax) * friction;
        this.velocity.y = (this.velocity.y + ay) * friction;
        this.position.add(this.velocity);
        
        this.pulsePhase += this.pulseSpeed;
    }
    
    draw(ctx, paletteColors) {
        ctx.save();
        
        // Calculate pulsing radius
        const pulse = Math.sin(this.pulsePhase) * 1.5;
        const currentRadius = this.radius + pulse;
        
        // Styling based on Conformity state
        let primaryColor, glowColor;
        if (STATE.isBlending) {
            // Adopt swarm colors and blend in visually
            primaryColor = paletteColors[0];
            glowColor = primaryColor;
        } else {
            // Contrast/Isolated style: Hollow white ring, electric neon core
            primaryColor = '#ffffff';
            glowColor = '#ffffff';
        }
        
        // Radial glow
        const glowGrad = ctx.createRadialGradient(
            this.position.x, this.position.y, 2,
            this.position.x, this.position.y, currentRadius * 3.5
        );
        
        if (STATE.isBlending) {
            glowGrad.addColorStop(0, hexToRgba(glowColor, 0.8));
            glowGrad.addColorStop(0.3, hexToRgba(glowColor, 0.25));
            glowGrad.addColorStop(1, 'transparent');
        } else {
            glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            glowGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.15)');
            glowGrad.addColorStop(1, 'transparent');
        }
        
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, currentRadius * 3.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Core particle drawing
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, currentRadius, 0, Math.PI * 2);
        
        if (STATE.isBlending) {
            // Solid filled core like the swarm
            ctx.fillStyle = primaryColor;
            ctx.fill();
        } else {
            // Hollow ring for contrast
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            
            // Tiny neon core in the center of the ring
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = paletteColors[2];
            ctx.fill();
        }
        
        // Subtle exclusion aura boundary line (purely aesthetic representation of the void)
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, CONFIG.playerRepulsionRadius, 0, Math.PI * 2);
        ctx.strokeStyle = STATE.isBlending ? hexToRgba(paletteColors[0], 0.03) : 'rgba(255, 255, 255, 0.04)';
        ctx.setLineDash([3, 10]);
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
    }
}

// --- BOID CLASS ---
class Boid {
    constructor(x, y, colorIndex) {
        this.position = new Vector(x, y);
        this.velocity = Vector.random2D().mult(Math.random() * 2 + 1);
        this.acceleration = new Vector(0, 0);
        this.radius = CONFIG.baseParticleRadius + (Math.random() * 2 - 1); // Slight organic variation
        this.colorIndex = colorIndex;
        
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.02 + Math.random() * 0.03;
        this.flashTime = 0; // Timer for the click-wave resonance flash
    }
    
    update() {
        // Adjust speed dynamically based on controller settings
        const targetMaxSpeed = STATE.swarmSpeed;
        const currentSpeed = this.velocity.mag();
        
        if (Math.abs(currentSpeed - targetMaxSpeed) > 0.1) {
            // Smoothly interpolate current velocity magnitude to match setting
            this.velocity.normalize().mult(interpolate(currentSpeed, targetMaxSpeed, 0.05));
        }
        
        this.velocity.add(this.acceleration);
        this.velocity.limit(STATE.swarmSpeed);
        this.position.add(this.velocity);
        
        // Reset acceleration
        this.acceleration.mult(0);
        
        // Decay flash state
        if (this.flashTime > 0) {
            this.flashTime--;
        }
    }
    
    applyForce(force) {
        this.acceleration.add(force);
    }
    
    flock(boids, player) {
        const sep = this.separate(boids);
        const ali = this.align(boids);
        const coh = this.cohere(boids);
        const rep = this.repelFromPlayer(player);
        
        // Weight behaviors
        sep.mult(CONFIG.flockWeights.separation);
        ali.mult(CONFIG.flockWeights.alignment);
        coh.mult(CONFIG.flockWeights.cohesion);
        rep.mult(CONFIG.playerRepulsionForce);
        
        this.applyForce(sep);
        this.applyForce(ali);
        this.applyForce(coh);
        this.applyForce(rep);
        
        // Kuramoto-like Phase Synchronization (Bioluminescence)
        let averagePhase = 0;
        let neighborCount = 0;
        
        for (let i = 0; i < boids.length; i++) {
            const other = boids[i];
            const d = this.position.dist(other.position);
            if (d > 0 && d < CONFIG.flockDistances.cohesion) {
                averagePhase += other.pulsePhase;
                neighborCount++;
            }
        }
        
        if (neighborCount > 0) {
            averagePhase /= neighborCount;
            const distToPlayer = player && STATE.mouse.active ? this.position.dist(player.position) : Infinity;
            
            if (distToPlayer < CONFIG.playerRepulsionRadius) {
                // Sincronía Rota: Chaos and rapid flash rate when near the player
                this.pulsePhase += this.pulseSpeed * 3.5;
                this.pulsePhase += (Math.random() - 0.5) * 0.2;
            } else {
                // Collective Sincronía: pull phases together
                this.pulsePhase = interpolate(this.pulsePhase, averagePhase, 0.025);
                this.pulsePhase += this.pulseSpeed;
            }
        } else {
            this.pulsePhase += this.pulseSpeed;
        }
    }
    
    // --- FLOCKING BEHAVIORS ---
    
    // Separation: avoid crowding local boids
    separate(boids) {
        const steer = new Vector(0, 0);
        let count = 0;
        
        for (let i = 0; i < boids.length; i++) {
            const other = boids[i];
            const d = this.position.dist(other.position);
            
            if (d > 0 && d < CONFIG.flockDistances.separation) {
                const diff = this.position.copy().sub(other.position);
                diff.normalize();
                diff.div(d); // Closer boids exert stronger force
                steer.add(diff);
                count++;
            }
        }
        
        if (count > 0) {
            steer.div(count);
        }
        
        if (steer.magSq() > 0) {
            steer.normalize();
            steer.mult(STATE.swarmSpeed);
            steer.sub(this.velocity);
            steer.limit(CONFIG.maxForce);
        }
        
        return steer;
    }
    
    // Alignment: align heading with local boids
    align(boids) {
        const sum = new Vector(0, 0);
        let count = 0;
        
        for (let i = 0; i < boids.length; i++) {
            const other = boids[i];
            const d = this.position.dist(other.position);
            
            if (d > 0 && d < CONFIG.flockDistances.alignment) {
                sum.add(other.velocity);
                count++;
            }
        }
        
        if (count > 0) {
            sum.div(count);
            sum.normalize();
            sum.mult(STATE.swarmSpeed);
            const steer = sum.sub(this.velocity);
            steer.limit(CONFIG.maxForce);
            return steer;
        }
        
        return new Vector(0, 0);
    }
    
    // Cohesion: move toward center of gravity of local boids
    cohere(boids) {
        const sum = new Vector(0, 0);
        let count = 0;
        
        for (let i = 0; i < boids.length; i++) {
            const other = boids[i];
            const d = this.position.dist(other.position);
            
            if (d > 0 && d < CONFIG.flockDistances.cohesion) {
                sum.add(other.position);
                count++;
            }
        }
        
        if (count > 0) {
            sum.div(count);
            return this.seek(sum);
        }
        
        return new Vector(0, 0);
    }
    
    // Repel from player (The Bubble of Isolation)
    repelFromPlayer(player) {
        if (!player || !STATE.mouse.active) return new Vector(0, 0);
        
        const d = this.position.dist(player.position);
        
        // If within exclusion field
        if (d < CONFIG.playerRepulsionRadius) {
            // Dynamic steering away from player
            const steerDir = this.position.copy().sub(player.position);
            steerDir.normalize();
            
            // Calculate scale: force is maximal close to the player and tapers off near the boundary
            const intensity = 1 - (d / CONFIG.playerRepulsionRadius);
            
            // Create a soft steer force
            steerDir.mult(STATE.swarmSpeed * 1.5 * intensity);
            const steer = steerDir.sub(this.velocity);
            steer.limit(CONFIG.maxForce * 2.2); // Give it higher priority / acceleration limits
            return steer;
        }
        
        return new Vector(0, 0);
    }
    
    seek(target) {
        const desired = target.copy().sub(this.position);
        desired.normalize();
        desired.mult(STATE.swarmSpeed);
        const steer = desired.sub(this.velocity);
        steer.limit(CONFIG.maxForce);
        return steer;
    }
    
    // Screen boundary wrapping
    edges() {
        const buffer = 20;
        if (this.position.x < -buffer) this.position.x = window.innerWidth + buffer;
        if (this.position.x > window.innerWidth + buffer) this.position.x = -buffer;
        if (this.position.y < -buffer) this.position.y = window.innerHeight + buffer;
        if (this.position.y > window.innerHeight + buffer) this.position.y = -buffer;
    }
    
    draw(ctx, paletteColors) {
        const color = paletteColors[this.colorIndex % paletteColors.length];
        
        ctx.save();
        
        // Calculate breathing glow
        const pulse = Math.sin(this.pulsePhase) * 1.0;
        let currentRadius = this.radius + pulse;
        let opacity = 0.8;
        let glowSize = 3;
        
        // Enhance visual styling when in flashed state
        if (this.flashTime > 0) {
            currentRadius *= 1.8;
            opacity = 1.0;
            glowSize = 5;
        }
        
        // Radial particle glow gradient
        const radGrad = ctx.createRadialGradient(
            this.position.x, this.position.y, 1,
            this.position.x, this.position.y, currentRadius * glowSize
        );
        
        if (this.flashTime > 0) {
            radGrad.addColorStop(0, '#ffffff');
            radGrad.addColorStop(0.35, hexToRgba(color, 0.4));
        } else {
            radGrad.addColorStop(0, hexToRgba(color, opacity));
            radGrad.addColorStop(0.35, hexToRgba(color, opacity * 0.25));
        }
        radGrad.addColorStop(1, 'transparent');
        
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, currentRadius * glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Solid core
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.flashTime > 0 ? '#ffffff' : color;
        ctx.fill();
        
        ctx.restore();
    }
}

// --- HELPER MATH & UTILITIES ---
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function interpolate(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

// Check proximity of boids to create glowing network links and sounds
function processConnections(ctx, boids, colors) {
    let audioTriggersCount = 0;
    
    for (let i = 0; i < boids.length; i++) {
        const b1 = boids[i];
        
        for (let j = i + 1; j < boids.length; j++) {
            const b2 = boids[j];
            const d = b1.position.dist(b2.position);
            
            // If they are close, draw an organic bond
            if (d < STATE.bondRadius) {
                const bondId = `${i}-${j}`;
                const bondState = STATE.bonds.get(bondId);
                
                // If this bond has already snapped, keep it invisible until particles separate
                if (bondState && bondState.snapped) {
                    continue;
                }
                
                // Calculate bond opacity based on proximity
                const opacity = (1 - (d / STATE.bondRadius)) * 0.28;
                let isBent = false;
                let controlPoint = null;
                
                const midX = (b1.position.x + b2.position.x) / 2;
                const midY = (b1.position.y + b2.position.y) / 2;
                const M = new Vector(midX, midY);
                
                if (STATE.mouse.active) {
                    const playerDist = M.dist(STATE.player.position);
                    if (playerDist < CONFIG.playerRepulsionRadius) {
                        const intensity = 1 - (playerDist / CONFIG.playerRepulsionRadius);
                        const deform = intensity * 60; // Max bend displacement 60px
                        
                        if (deform > 38) {
                            // Snap threshold reached!
                            STATE.bonds.set(bondId, { snapped: true });
                            continue;
                        } else {
                            // Bent state
                            isBent = true;
                            const repelDir = M.copy().sub(STATE.player.position).normalize();
                            controlPoint = M.copy().add(repelDir.mult(deform));
                        }
                    }
                }
                
                // Draw connecting bond line (straight or bent)
                ctx.beginPath();
                ctx.moveTo(b1.position.x, b1.position.y);
                
                if (isBent && controlPoint) {
                    ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, b2.position.x, b2.position.y);
                } else {
                    ctx.lineTo(b2.position.x, b2.position.y);
                    // Clear snapped state if it was there and is now out of repulsion range
                    STATE.bonds.delete(bondId);
                }
                
                // Create a gradient for the bond line blending both particle colors
                const grad = ctx.createLinearGradient(
                    b1.position.x, b1.position.y, 
                    b2.position.x, b2.position.y
                );
                grad.addColorStop(0, hexToRgba(colors[b1.colorIndex % colors.length], opacity));
                grad.addColorStop(1, hexToRgba(colors[b2.colorIndex % colors.length], opacity));
                
                ctx.strokeStyle = grad;
                ctx.lineWidth = (1 - (d / STATE.bondRadius)) * 1.5;
                ctx.stroke();
                
                // Generative Sound Trigger:
                // If audio is enabled, trigger chimes based on proximity spikes.
                if (STATE.audioEnabled && Math.random() < 0.0003 && audioTriggersCount < 3) {
                    // Map boid color/properties to a note index
                    const scaleNoteIndex = (b1.colorIndex * 3 + Math.floor(b1.position.y / 80)) % 15;
                    const volumeFactor = (1 - (d / STATE.bondRadius)) * 0.04;
                    
                    try {
                        STATE.audioEngine.playTone(scaleNoteIndex, volumeFactor);
                    } catch (e) {
                        console.warn("AudioEngine playTone failed:", e);
                    }
                    audioTriggersCount++;
                }
            } else {
                // If they are far away, reset the bond state so it can snap again if they reconnect
                const bondId = `${i}-${j}`;
                STATE.bonds.delete(bondId);
            }
        }
    }
}

// --- MAIN ENGINE CONTROLLERS ---

const CanvasApp = {
    canvas: null,
    ctx: null,
    animationFrameId: null,
    
    init() {
        this.canvas = document.getElementById('simulation-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Spawn Player
        STATE.player = new Player();
        
        // Initial setup of the swarm
        this.updateSwarmSize();
        
        // Set mouse event listeners
        this.initMouseEvents();
        
        // Start animation loop
        this.loop();
    },
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },
    
    initMouseEvents() {
        const updateMousePosition = (e) => {
            STATE.mouse.active = true;
            STATE.mouse.targetX = e.clientX;
            STATE.mouse.targetY = e.clientY;
            
            // Set targets on Player
            STATE.player.targetX = e.clientX;
            STATE.player.targetY = e.clientY;
        };
        
        const triggerPulseWave = (x, y) => {
            STATE.pulseWave.active = true;
            STATE.pulseWave.position = new Vector(x, y);
            STATE.pulseWave.radius = 0;
            STATE.pulseWave.hitBoids.clear();
            
            // Play deep, resonant calling chord (Idea 4)
            if (STATE.audioEnabled && STATE.audioEngine) {
                try {
                    STATE.audioEngine.playCallTone();
                } catch (e) {
                    console.warn("AudioEngine playCallTone failed:", e);
                }
            }
        };
        
        window.addEventListener('mousemove', updateMousePosition);
        
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                updateMousePosition(e.touches[0]);
            }
        }, { passive: true });
        
        // Register clicks to send the wave
        window.addEventListener('mousedown', (e) => {
            // Ignore if clicking UI elements
            if (e.target.closest('.control-panel') || e.target.closest('.audio-btn') || e.target.closest('#splash-screen')) {
                return;
            }
            triggerPulseWave(e.clientX, e.clientY);
        });
        
        window.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                const t = e.touches[0];
                if (t.target.closest('.control-panel') || t.target.closest('.audio-btn') || t.target.closest('#splash-screen')) {
                    return;
                }
                triggerPulseWave(t.clientX, t.clientY);
            }
        }, { passive: true });
        
        // Deactivate player when mouse leaves viewport
        document.addEventListener('mouseleave', () => {
            STATE.mouse.active = false;
        });
        
        window.addEventListener('touchend', () => {
            STATE.mouse.active = false;
        });
    },
    
    updateSwarmSize() {
        const diff = STATE.swarmSize - STATE.boids.length;
        const currentPalette = CONFIG.palettes[STATE.activePalette].colors;
        
        if (diff > 0) {
            // Spawn new boids in randomized positions
            for (let i = 0; i < diff; i++) {
                const x = Math.random() * window.innerWidth;
                const y = Math.random() * window.innerHeight;
                // Assign a color index from the current theme palette
                const colorIndex = Math.floor(Math.random() * currentPalette.length);
                STATE.boids.push(new Boid(x, y, colorIndex));
            }
        } else if (diff < 0) {
            // Remove extra boids
            STATE.boids.splice(STATE.boids.length + diff, Math.abs(diff));
        }
    },
    
    loop() {
        // Leave trails instead of hard clearing
        this.ctx.fillStyle = CONFIG.clearColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        const palette = CONFIG.palettes[STATE.activePalette];
        const paletteColors = palette.colors;
        
        // Draw the bonds first so they lay underneath particle cores
        processConnections(this.ctx, STATE.boids, paletteColors);
        
        // Update and draw snap particles (Idea 1)
        for (let i = STATE.particles.length - 1; i >= 0; i--) {
            const p = STATE.particles[i];
            p.update();
            if (p.life <= 0) {
                STATE.particles.splice(i, 1);
            } else {
                p.draw(this.ctx);
            }
        }
        
        // Update and draw the click-pulse wave (Idea 4)
        if (STATE.pulseWave.active) {
            STATE.pulseWave.radius += STATE.pulseWave.speed;
            
            const waveOpacity = 1 - (STATE.pulseWave.radius / STATE.pulseWave.maxRadius);
            
            this.ctx.beginPath();
            this.ctx.arc(STATE.pulseWave.position.x, STATE.pulseWave.position.y, STATE.pulseWave.radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = STATE.isBlending 
                ? hexToRgba(paletteColors[0], waveOpacity * 0.15) 
                : `rgba(255, 255, 255, ${waveOpacity * 0.28})`;
            this.ctx.lineWidth = 2.5;
            this.ctx.stroke();
            
            if (STATE.pulseWave.radius >= STATE.pulseWave.maxRadius) {
                STATE.pulseWave.active = false;
                STATE.pulseWave.hitBoids.clear();
            }
        }
        
        // Update and draw the player particle (if active)
        if (STATE.mouse.active) {
            STATE.player.update();
            STATE.player.draw(this.ctx, paletteColors);
        }
        
        // Find nearest boid and compute velocities for audio dampening
        let closestDist = Infinity;
        
        // Update and draw all boids
        for (let i = 0; i < STATE.boids.length; i++) {
            const boid = STATE.boids[i];
            
            // Check intersection with expanding wave front
            if (STATE.pulseWave.active && !STATE.pulseWave.hitBoids.has(i)) {
                const distToWave = boid.position.dist(STATE.pulseWave.position);
                
                if (Math.abs(distToWave - STATE.pulseWave.radius) < 18) {
                    STATE.pulseWave.hitBoids.add(i);
                    boid.flashTime = 25; // Visual flash duration in frames
                    
                    // Steer forcefully away from click source (escape push)
                    const escapeForce = boid.position.copy().sub(STATE.pulseWave.position).normalize().mult(STATE.swarmSpeed * 3.5);
                    boid.applyForce(escapeForce);
                    
                    // Play a ringing response note (Idea 4 call and response)
                    if (STATE.audioEnabled && STATE.audioEngine) {
                        try {
                            const noteIdx = (boid.colorIndex * 2 + 5) % 15;
                            STATE.audioEngine.playTone(noteIdx, 0.05);
                        } catch (e) {
                            console.warn("AudioEngine playTone (wave response) failed:", e);
                        }
                    }
                }
            }
            
            // Flocking behaviors
            boid.flock(STATE.boids, STATE.player);
            boid.update();
            boid.edges();
            boid.draw(this.ctx, paletteColors);
            
            // Track closest distance to player (for audio processing)
            if (STATE.mouse.active) {
                const distToPlayer = boid.position.dist(STATE.player.position);
                if (distToPlayer < closestDist) {
                    closestDist = distToPlayer;
                }
            }
        }
        
        // Update Web Audio API properties based on physical states
        if (STATE.audioEnabled && STATE.audioEngine) {
            try {
                const playerVelMag = STATE.player.velocity.mag();
                const activeDistance = STATE.mouse.active ? closestDist : Infinity;
                STATE.audioEngine.updateAudioState(playerVelMag, activeDistance);
            } catch (e) {
                console.warn("AudioEngine updateAudioState failed:", e);
            }
        }
        
        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
};

// --- INITIALIZE INTERACTIVE CONTROLS ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Enter Experience Buttons (initialize AudioContext)
    const enterBtn = document.getElementById('enter-btn');
    const enterMutedBtn = document.getElementById('enter-muted-btn');
    const splashScreen = document.getElementById('splash-screen');
    const experienceUi = document.getElementById('experience-ui');
    const audioCheckbox = document.getElementById('audio-checkbox');
    const audioToggle = document.getElementById('audio-toggle');
    const audioBtnText = audioToggle.querySelector('.btn-text');
    
    const startExperience = (startMuted) => {
        // Initialize Audio Engine
        STATE.audioEngine = new AudioEngine();
        const audioSuccess = STATE.audioEngine.init();
        
        if (audioSuccess) {
            if (startMuted) {
                STATE.audioEnabled = false;
                STATE.audioEngine.mute();
                audioToggle.classList.add('muted');
                audioBtnText.textContent = "Unmute";
                audioCheckbox.checked = false;
            } else {
                STATE.audioEnabled = true;
                STATE.audioEngine.unmute();
                audioToggle.classList.remove('muted');
                audioBtnText.textContent = "Mute";
                audioCheckbox.checked = true;
            }
        } else {
            // If audio failed to load (no Web Audio support)
            audioToggle.classList.add('hidden');
            const audioGroup = document.querySelector("label[for='audio-checkbox']");
            if (audioGroup) {
                audioGroup.closest('.control-group').classList.add('hidden');
            }
        }
        
        // Fade out splash screen and fade in experience UI
        splashScreen.classList.add('fade-out');
        experienceUi.classList.remove('hidden');
        experienceUi.classList.add('fade-in');
        
        // Initialize canvas application
        CanvasApp.init();
    };
    
    enterBtn.addEventListener('click', () => startExperience(false));
    enterMutedBtn.addEventListener('click', () => startExperience(true));
    
    // 2. Audio Toggle Button (Floating)
    audioToggle.addEventListener('click', () => {
        if (!STATE.audioEngine) return;
        
        if (STATE.audioEnabled) {
            STATE.audioEngine.mute();
            STATE.audioEnabled = false;
            audioToggle.classList.add('muted');
            audioBtnText.textContent = "Unmute";
            audioCheckbox.checked = false;
        } else {
            // Resume context if browser suspended it
            if (STATE.audioEngine.ctx && STATE.audioEngine.ctx.state === 'suspended') {
                STATE.audioEngine.ctx.resume();
            }
            STATE.audioEngine.unmute();
            STATE.audioEnabled = true;
            audioToggle.classList.remove('muted');
            audioBtnText.textContent = "Mute";
            audioCheckbox.checked = true;
        }
    });
    
    // Audio Checkbox (Control Panel)
    audioCheckbox.addEventListener('change', (e) => {
        if (!STATE.audioEngine) return;
        
        if (e.target.checked) {
            if (STATE.audioEngine.ctx && STATE.audioEngine.ctx.state === 'suspended') {
                STATE.audioEngine.ctx.resume();
            }
            STATE.audioEngine.unmute();
            STATE.audioEnabled = true;
            audioToggle.classList.remove('muted');
            audioBtnText.textContent = "Mute";
        } else {
            STATE.audioEngine.mute();
            STATE.audioEnabled = false;
            audioToggle.classList.add('muted');
            audioBtnText.textContent = "Unmute";
        }
    });
    
    // 3. Settings UI Sliders
    const swarmSizeSlider = document.getElementById('swarm-size');
    const swarmSizeVal = document.getElementById('swarm-size-val');
    swarmSizeSlider.addEventListener('input', (e) => {
        STATE.swarmSize = parseInt(e.target.value);
        swarmSizeVal.textContent = STATE.swarmSize;
        if (CanvasApp.canvas) {
            CanvasApp.updateSwarmSize();
        }
    });
    
    const swarmSpeedSlider = document.getElementById('swarm-speed');
    const swarmSpeedVal = document.getElementById('swarm-speed-val');
    swarmSpeedSlider.addEventListener('input', (e) => {
        STATE.swarmSpeed = parseFloat(e.target.value);
        swarmSpeedVal.textContent = STATE.swarmSpeed.toFixed(1);
    });
    
    const bondRadiusSlider = document.getElementById('bond-radius');
    const bondRadiusVal = document.getElementById('bond-radius-val');
    bondRadiusSlider.addEventListener('input', (e) => {
        STATE.bondRadius = parseInt(e.target.value);
        bondRadiusVal.textContent = STATE.bondRadius + 'px';
    });
    
    // 4. Color Palette Selectors
    const paletteButtons = document.querySelectorAll('.palette-btn');
    paletteButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            paletteButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            STATE.activePalette = btn.getAttribute('data-palette');
            
            // Dynamic adjustment of CSS custom property colors for background glows
            const paletteData = CONFIG.palettes[STATE.activePalette];
            document.documentElement.style.setProperty('--color-1', paletteData.ambientGlows[0]);
            document.documentElement.style.setProperty('--color-2', paletteData.ambientGlows[1]);
            document.documentElement.style.setProperty('--bg-color', paletteData.background);
            
            // Re-index all existing boids with new palette colors randomly
            STATE.boids.forEach(boid => {
                boid.colorIndex = Math.floor(Math.random() * paletteData.colors.length);
            });
        });
    });
    
    // 5. Adapt/Conform button (Visual Blending Metaphor)
    const conformBtn = document.getElementById('conform-btn');
    conformBtn.addEventListener('click', () => {
        STATE.isBlending = !STATE.isBlending;
        
        if (STATE.isBlending) {
            conformBtn.textContent = "Isolate Yourself";
            conformBtn.classList.add('active');
            
            // Inform the user through subtle hint changing
            document.getElementById('interaction-hint').textContent = "Visual adaptation complete. Yet, the physical void remains.";
        } else {
            conformBtn.textContent = "Try to Blend In";
            conformBtn.classList.remove('active');
            document.getElementById('interaction-hint').textContent = "Observe the swarm's movement as you approach.";
        }
    });
    
    // 6. Sidebar toggles (Minimize/Expand control panel)
    const panelToggle = document.getElementById('panel-toggle');
    const controlPanel = document.querySelector('.control-panel');
    
    panelToggle.addEventListener('click', () => {
        controlPanel.classList.toggle('collapsed');
        if (controlPanel.classList.contains('collapsed')) {
            panelToggle.innerHTML = "⚙️"; // Settings gear icon when collapsed
            panelToggle.setAttribute('aria-label', 'Open Panel');
        } else {
            panelToggle.innerHTML = "×"; // Close cross when open
            panelToggle.setAttribute('aria-label', 'Close Panel');
        }
    });
});
