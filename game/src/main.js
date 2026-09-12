import { texStr } from '../assets/noise.js';
import { gfx } from "../assets/art/pixelart.js";
import { BLOCK_SIZE, PIXEL_SIZE, GRAVITY } from './utils/constants.js'
import { graphics, rasterizer } from './graphics.js'
import { keys } from './utils/input.js'
import { Funcs } from './utils/funcs.js'
import { Fabric } from './systems/fabric.js'


//garbage collect
for (let i = window.requestAnimationFrame(function() {}); i > 0; i--) {
    window.cancelAnimationFrame(i);
}

/** setup code for HTML5 Canvas */
graphics.init('game')

//frame manipulation, dt's, fps, etc
let dt, dtMs, fps;
let lastTime = performance.now();

/** Config */
let nxt = true;
let currentLevel = 0;
let blocks = [];
let blockGrid = new Map();

const tileSprite = typeof gfx !== "undefined" && gfx?.tiles?.A?.yyyy ? gfx.tiles.A.yyyy : null;
const backdropSprite = typeof gfx !== "undefined" && gfx?.props?.backdrops?.dungeon ? gfx.props.backdrops.dungeon : null;
const playerSprites = typeof gfx !== "undefined" && gfx?.player ? gfx.player : null;


let frameTime = 0;

/*
    WATER SYSTEM
*/

//maps a water tile's world x (column) to the world y of that column's surface the topmost water tile above it
let waterSurfaceByColumn = {};

//palette
const waterPalette = {
    surface: "#467ed3de",
    body: "#1f52b1",
};

const WATER_WAVE = {
    freq: 0.018,   
    speed: 0.29,   
    phaseScale: 0, 
    
};
const WATER_LIGHT_ANGLE_DEG = 22;
const WATER_TILT_PER_ROW = -Math.tan(WATER_LIGHT_ANGLE_DEG * Math.PI / 180) * (BLOCK_SIZE / 9);

//light streaks
class LightStreak {
    constructor(options = {}) {
        this.x = options.x ?? 0;
        this.width = options.width ?? 20;
        this.opacity = options.opacity ?? 0.4;
        this.color = options.color ?? "#4fc3ff";
        this.tilt = options.tilt ?? 0;
        this.swayAmp = options.swayAmp ?? 6;
        this.swayFreq = options.swayFreq ?? 0.04;
        this.swaySpeed = options.swaySpeed ?? 0.2;
        this.swayPhase = options.swayPhase ?? 0;
        this.anchorDepth = options.anchorDepth ?? 200;
    }

    centerAt(depth, t, surfaceDepth = null) {
        const sway = Math.sin(depth * this.swayFreq + t * this.swaySpeed + this.swayPhase) * this.swayAmp;
        const anchorFactor = surfaceDepth === null ? 1 : Funcs.constrain(surfaceDepth / this.anchorDepth, 0, 1);
        return this.x
            + depth * this.tilt
            + sway * anchorFactor;
    }

    covers(worldX, depth, t, surfaceDepth) {
        return Math.abs(worldX - this.centerAt(depth, t, surfaceDepth)) < this.width / 2;
    }
}
function createLightStreaks(spanWidth, opts) {
    const streaks = [];
    let x = -150;
    while (x < spanWidth + 200) {
        const width = opts.minWidth + seededRandom() * (opts.maxWidth - opts.minWidth);
        const gap = opts.minGap + seededRandom() * (opts.maxGap - opts.minGap);
        const centerX = x + width / 2;
        streaks.push(new LightStreak({
            x: centerX,
            width,
            opacity: opts.minOpacity + seededRandom() * (opts.maxOpacity - opts.minOpacity),
            color: opts.palette[Math.floor(seededRandom() * opts.palette.length)],
            tilt: opts.tilt,
            swayAmp: opts.swayAmp,
            swayFreq: WATER_WAVE.freq,
            swaySpeed: WATER_WAVE.speed,
            swayPhase: centerX * WATER_WAVE.phaseScale,
        }));
        x += width + gap;
    }
    return streaks;
}
let lightStreaksWide = [];
let lightStreaksFine = [];

//ambient light ripples
class LightRipple {
    constructor(options = {}) {
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        this.length = options.length ?? 180;
        this.thickness = options.thickness ?? 24;
        this.opacity = options.opacity ?? 0.16;
        this.color = options.color ?? "#dff6ff";
        this.speed = options.speed ?? 8;
        this.frequency = options.frequency ?? 0.03;
        this.phase = options.phase ?? 0;
        this.direction = options.direction ?? 1;
        this.seed = options.seed ?? 0;
        this.noiseScale = options.noiseScale ?? 0.045;
        this.driftSpeed = options.driftSpeed ?? 0.3;
        this.beamWidth = options.beamWidth ?? 1;
        this.beamHeight = options.beamHeight ?? 1;
        this.angle = options.angle ?? 0;
        this.sway = options.sway ?? 0.2;
        this.penetrationLength = options.penetrationLength ?? 180;
    }

    noise(x, y) {
        const value = Math.sin(x * 12.9898 + y * 78.233 + this.seed * 37.719) * 43758.5453123;
        return value - Math.floor(value);
    }

    intensityAt(px, py, t) {
        const travel = (t * this.speed + this.phase) * this.direction;
        const dx = px - (this.x + travel * 0.65);
        const dy = py - (this.y + Math.sin(dx * 0.018 + this.phase) * this.thickness * 0.12 + Math.cos(t * 0.0006 + this.seed * 0.002) * 8);
        const along = dx * Math.cos(this.angle) + dy * Math.sin(this.angle);
        const across = -dx * Math.sin(this.angle) + dy * Math.cos(this.angle);
        const band = Math.max(0, 1 - Math.abs(along) / (this.length * 0.5));
        const widthFalloff = Math.max(0, 1 - Math.abs(across) / (this.thickness * 0.5));

        if (band <= 0 || widthFalloff <= 0) {
            return 0;
        }

        const wave = Math.sin(dx * this.frequency + this.phase + travel * this.driftSpeed) * 0.5 + 0.5;
        const warp = Math.sin(dy * 0.08 + t * 0.12 + this.seed * 0.001) * 0.7
            + Math.cos(dx * 0.03 + this.seed * 0.0012) * 0.35;
        const edge = Math.pow(widthFalloff, 0.9);
        const grain = (this.noise(px * this.noiseScale, py * this.noiseScale + this.seed * 0.0005) + 1) * 0.5;
        const distanceDown = Math.max(0, py - this.y);
        const penetration = Math.max(0, 1 - distanceDown / this.penetrationLength);
        const verticalFade = Math.max(0, penetration * penetration);
        const base = band * widthFalloff * (0.3 + wave * 0.7) * this.opacity;
        return Math.max(0, base * (0.4 + grain * 1.1) * edge * (0.7 + warp * 0.35) * verticalFade);
    }

    drawOverTile(ctx, px, py, cellW, cellH, time) {
        const intensity = this.intensityAt(px + cellW / 2, py + cellH / 2, time);
        if (intensity <= 0.002) {
            return;
        }

        const beamW = Math.max(cellW * 0.5, cellW * (0.8 + intensity * 2.2) * (0.55 + this.beamWidth * 0.75));
        const beamH = Math.max(cellH * 0.4, cellH * (0.7 + intensity * 1.8) * (0.55 + this.beamHeight * 0.75));
        const x = px - (beamW - cellW) * 0.35;
        const y = py - (beamH - cellH) * 0.25;
        const distanceDown = Math.max(0, py - this.y);
        const topFade = Math.max(0, 1 - distanceDown / this.penetrationLength);

        graphics.ctx.save();
        graphics.ctx.globalAlpha = Math.min(0.95, intensity * 2.8 * topFade * topFade);
        graphics.ctx.fillStyle = this.color;
        graphics.ctx.translate(x + beamW / 2, y + beamH / 2);
        graphics.ctx.rotate(this.angle + Math.sin(time * 0.0007 + this.phase) * this.sway);
        graphics.ctx.fillRect(-beamW / 2, -beamH / 2, beamW, beamH);
        graphics.ctx.restore();
    }
}

let rippleSeed = Math.floor(performance.now() * 1000) ^ Math.floor(Math.random() * 0xffffffff);

function seededRandom() {
    rippleSeed = (rippleSeed * 1664525 + 1013904223) >>> 0;
    return rippleSeed / 0x100000000;
}

function createRandomRipples(count = 12) {
    const ripples = [];
    const palette = ["#dff6ff", "#e5f9ff", "#c7f1ff", "#a7deff", "#8edcff"];

    for (let i = 0; i < count; i++) {
        const length = 80 + seededRandom() * 220;
        const thickness = 10 + seededRandom() * 34;
        const x = seededRandom() * 1100 - 550;
        const y = -40 - seededRandom() * 180;
        const speed = 1.2 + seededRandom() * 5.2;
        const frequency = 0.008 + seededRandom() * 0.028;
        const direction = seededRandom() > 0.5 ? 1 : -1;
        const opacity = 0.06 + seededRandom() * 0.16;
        const phase = seededRandom() * Math.PI * 2;
        const beamWidth = 0.45 + seededRandom() * 1.1;
        const beamHeight = 0.35 + seededRandom() * 1.2;
        const driftSpeed = 0.08 + seededRandom() * 0.9;
        const angle = (seededRandom() - 0.5) * Math.PI * 0.45;
        const sway = 0.04 + seededRandom() * 0.3;

        ripples.push(new LightRipple({
            x,
            y,
            length,
            thickness,
            opacity,
            speed,
            frequency,
            phase,
            direction,
            seed: seededRandom() * 10000,
            beamWidth,
            beamHeight,
            driftSpeed,
            angle,
            sway,
            penetrationLength: 140 + seededRandom() * 90,
            color: palette[Math.floor(seededRandom() * palette.length)],
        }));
    }

    return ripples;
}

let waterRipples = createRandomRipples(20);

//water tile rendering
function drawWaterTile(x, y, w, h, topSurface) {
    const cols = 9;
    const rows = 9;
    const cellW = Math.max(1, Math.floor(w / cols));
    const cellH = Math.max(1, Math.floor(h / rows));
    const t = frameTime / 1000;
    const baseRow = Math.floor(y / cellH);

    graphics.ctx.save();
    graphics.ctx.imageSmoothingEnabled = false;

    const surfaceRowStarts = [];
    if (topSurface) {
        for (let col = 0; col < cols; col++) {
            const cellCenterX = x + col * cellW + cellW / 2;
            const displacement = waterDisplacementAt(cellCenterX);
            surfaceRowStarts.push(2 + Math.round(displacement / cellH));
        }
    }

    const minRow = topSurface ? Math.min(0, ...surfaceRowStarts) : 0;

    for (let row = minRow; row < rows; row++) {
        const gy = baseRow + row;
        const px0 = x, py = y + row * cellH;

        for (let col = 0; col < cols; col++) {
            const px = px0 + col * cellW;

            if (topSurface && row < surfaceRowStarts[col]) continue;

            if (topSurface && row === surfaceRowStarts[col]) {
                graphics.ctx.globalAlpha = 0.55;
                graphics.ctx.fillStyle = waterPalette.surface;
                graphics.ctx.fillRect(px, py, cellW, cellH);
                continue;
            }
            const surfaceY = waterSurfaceByColumn[x] ?? y;
            const depth = py - surfaceY;
            const fadeDistance = 300;
            const depthFade = Math.max(0.08, Math.pow(Math.max(0, 1 - depth / fadeDistance), 1.3));
            graphics.ctx.globalAlpha = 0.32 + 0.26 * depthFade;
            graphics.ctx.fillStyle = waterPalette.body;
            graphics.ctx.fillRect(px, py, cellW, cellH);
            graphics.ctx.globalCompositeOperation = "lighter";
            const cellCenterX = px + cellW / 2;
            const cellCenterY = py + cellH / 2;
            const disturbance = waterLightDisturbances.length ? waterLightBendAt(cellCenterX, cellCenterY) : { bend: 0, glow: 0 };
            const sampleX = cellCenterX + disturbance.bend;

            const wide = lightStreaksWide.find((s) => s.covers(sampleX, gy, t, depth));
            if (wide) {
                graphics.ctx.globalAlpha = Funcs.constrain((wide.opacity + disturbance.glow * 0.6) * depthFade, 0, 1);
                graphics.ctx.fillStyle = wide.color;
                graphics.ctx.fillRect(px, py, cellW, cellH);
            }

            const fine = lightStreaksFine.find((s) => s.covers(sampleX, gy, t, depth));
            if (fine) {
                graphics.ctx.globalAlpha = Funcs.constrain((fine.opacity + disturbance.glow * 0.4) * depthFade, 0, 1);
                graphics.ctx.fillStyle = fine.color;
                graphics.ctx.fillRect(px, py, cellW, cellH);
            }

            graphics.ctx.globalCompositeOperation = "source-over";

            for (const ripple of waterRipples) {
                ripple.drawOverTile(graphics.ctx, px, py, cellW, cellH, t);
            }
        }
    }

    graphics.ctx.restore();
}

const UNDERWATER_DISTORT = {
    rowHeight: PIXEL_SIZE,
    amp: PIXEL_SIZE * 2,
    freq: WATER_WAVE.freq, 
    speed: WATER_WAVE.speed,
};
let frameBuffer = null;
let frameBufferCtx = null;

//surface spring simulation
const WATER_SPRING = {
    spacing: 5,
    tension: 0.022,
    damping: 0.05,
    spread: 0.16,
    spreadPasses: 8,
    splashRadius: 6,
    splashTransfer: 0.16,
    entryDamping: 0.5,
    entryMinImpact: 18,     
    entrySplashScale: 0.5, 
    pressBand: 90,
    weightPush: 6,
    idleAmplitude: 1,
    idleFreq: WATER_WAVE.freq * 3.4,
    idleSpeed: WATER_WAVE.speed * 1.7,
    maxDisplacement: 42,
    tensionBand: 30,
    surfaceTension: 270,
    skimBand: 26,          
    skimLift: 340,         
    skimAccelMul: 0.85,    
    skimSpeedMul: 1.15,    
    maxSwimSpeed: 480, 
};

class WaterSurfaceSegment {
    constructor(startX, endX, surfaceY) {
        this.startX = startX;
        this.endX = endX;
        this.surfaceY = surfaceY;
        this.spacing = WATER_SPRING.spacing;
        this.count = Math.max(2, Math.round((endX - startX) / this.spacing) + 1);
        this.heights = new Float32Array(this.count);
        this.velocities = new Float32Array(this.count);
    }

    containsX(worldX) {
        return worldX >= this.startX && worldX <= this.endX;
    }

    indexFor(worldX) {
        const rel = (worldX - this.startX) / this.spacing;
        return Funcs.constrain(Math.round(rel), 0, this.count - 1);
    }

    heightAt(worldX) {
        if (!this.containsX(worldX)) {
            return 0;
        }
        const rel = Funcs.constrain((worldX - this.startX) / this.spacing, 0, this.count - 1);
        const i0 = Math.floor(rel);
        const i1 = Math.min(this.count - 1, i0 + 1);
        const frac = rel - i0;
        return this.heights[i0] * (1 - frac) + this.heights[i1] * frac;
    }

    splash(worldX, velocity) {
        if (!this.containsX(worldX)) {
            return;
        }
        const center = this.indexFor(worldX);
        const radius = WATER_SPRING.splashRadius;
        for (let i = Math.max(0, center - radius); i <= Math.min(this.count - 1, center + radius); i++) {
            const falloff = 1 - Math.abs(i - center) / (radius + 1);
            this.velocities[i] += velocity * WATER_SPRING.splashTransfer * falloff;
        }
    }

    press(worldX, targetDepth, strength, dt) {
        if (!this.containsX(worldX)) {
            return;
        }
        const center = this.indexFor(worldX);
        const radius = WATER_SPRING.splashRadius;
        for (let i = Math.max(0, center - radius); i <= Math.min(this.count - 1, center + radius); i++) {
            const falloff = 1 - Math.abs(i - center) / (radius + 1);
            const diff = targetDepth - this.heights[i];
            this.velocities[i] += diff * strength * falloff * dt;
        }
    }

    update(dt) {
        const steps = dt * 60;
        for (let i = 0; i < this.count; i++) {
            const accel = -WATER_SPRING.tension * this.heights[i] - WATER_SPRING.damping * this.velocities[i];
            this.velocities[i] += accel * steps;
        }
        for (let i = 0; i < this.count; i++) {
            this.heights[i] += this.velocities[i] * steps;
        }
        const leftDeltas = new Float32Array(this.count);
        const rightDeltas = new Float32Array(this.count);
        for (let pass = 0; pass < WATER_SPRING.spreadPasses; pass++) {
            for (let i = 0; i < this.count; i++) {
                if (i > 0) {
                    leftDeltas[i] = WATER_SPRING.spread * (this.heights[i] - this.heights[i - 1]);
                    this.velocities[i - 1] += leftDeltas[i] * steps;
                }
                if (i < this.count - 1) {
                    rightDeltas[i] = WATER_SPRING.spread * (this.heights[i] - this.heights[i + 1]);
                    this.velocities[i + 1] += rightDeltas[i] * steps;
                }
            }
            for (let i = 0; i < this.count; i++) {
                if (i > 0) this.heights[i - 1] += leftDeltas[i] * steps;
                if (i < this.count - 1) this.heights[i + 1] += rightDeltas[i] * steps;
            }
        }
        for (let i = 0; i < this.count; i++) {
            this.heights[i] = Funcs.constrain(this.heights[i], -WATER_SPRING.maxDisplacement, WATER_SPRING.maxDisplacement);
        }
        
        //tether to the adjacent blocks so no gap
        if (this.count > 1) {
            this.heights[0] = 0;
            this.velocities[0] = 0;
            this.heights[this.count - 1] = 0;
            this.velocities[this.count - 1] = 0;
        }
    }
}

let waterSurfaceSegments = [];

function buildWaterSurfaceSegments() {
    waterSurfaceSegments = [];
    const columns = Object.keys(waterSurfaceByColumn).map(Number).sort((a, b) => a - b);
    let segStart = null;
    let segY = null;
    let prevX = null;
    for (const colX of columns) {
        const colY = waterSurfaceByColumn[colX];
        if (segStart === null) {
            segStart = colX;
            segY = colY;
        } else if (colX !== prevX + BLOCK_SIZE || colY !== segY) {
            waterSurfaceSegments.push(new WaterSurfaceSegment(segStart, prevX + BLOCK_SIZE, segY));
            segStart = colX;
            segY = colY;
        }
        prevX = colX;
    }
    if (segStart !== null) {
        waterSurfaceSegments.push(new WaterSurfaceSegment(segStart, prevX + BLOCK_SIZE, segY));
    }
}

function findWaterSegment(worldX) {
    for (const segment of waterSurfaceSegments) {
        if (segment.containsX(worldX)) {
            return segment;
        }
    }
    return null;
}

function updateWaterSurfaceSegments(dt) {
    for (const segment of waterSurfaceSegments) {
        segment.update(dt);
    }
}

function splashWaterSurface(worldX, velocity) {
    const segment = findWaterSegment(worldX);
    if (segment) {
        segment.splash(worldX, velocity);
    }
}

function pressWaterSurface(worldX, targetDepth, strength, dt) {
    const segment = findWaterSegment(worldX);
    if (segment) {
        segment.press(worldX, targetDepth, strength, dt);
    }
}

function waterIdleWave(worldX, t) {
    return Math.sin(worldX * WATER_SPRING.idleFreq + t * WATER_SPRING.idleSpeed) * WATER_SPRING.idleAmplitude
        + Math.sin(worldX * WATER_SPRING.idleFreq * 2.3 - t * WATER_SPRING.idleSpeed * 0.7) * WATER_SPRING.idleAmplitude * 0.4;
}

function waterDisplacementAt(worldX) {
    const segment = findWaterSegment(worldX);
    const spring = segment ? segment.heightAt(worldX) : 0;
    const total = spring + waterIdleWave(worldX, frameTime / 1000);
    return Funcs.constrain(total, -WATER_SPRING.maxDisplacement, WATER_SPRING.maxDisplacement);
}

function waterSurfaceLineAt(worldX) {
    const blockX = Math.floor(worldX / BLOCK_SIZE) * BLOCK_SIZE;
    const restY = waterSurfaceByColumn[blockX];
    if (restY === undefined) {
        return null;
    }
    const cellH = BLOCK_SIZE / 9;
    const displacement = waterDisplacementAt(worldX);
    const rowShift = Math.round(displacement / cellH);
    const surfaceRow = 2 + rowShift;
    return restY + surfaceRow * cellH;
}

//splash-triggered light disturbances
const WATER_LIGHT_BEND = {
    maxActive: 8,
    travelSpeed: 210,
    frontWidth: 44,
    radius: 68,
    freq: 0.055,
    oscSpeed: 6.5,
    decayRate: 0.85,
    lifespan: 2.4,
};

class WaterLightDisturbance {
    constructor(x, restY, strength) {
        this.x = x;
        this.restY = restY;
        this.strength = strength;
        this.age = 0;
    }

    update(dt) {
        this.age += dt;
    }

    isDone() {
        return this.age > WATER_LIGHT_BEND.lifespan;
    }

    sample(worldX, worldY) {
        const depth = worldY - this.restY;
        if (depth < 0) {
            return { bend: 0, glow: 0 };
        }
        const lateral = worldX - this.x;
        const radial = Math.exp(-(lateral * lateral) / (2 * WATER_LIGHT_BEND.radius * WATER_LIGHT_BEND.radius));
        if (radial < 0.015) {
            return { bend: 0, glow: 0 };
        }
        const front = this.age * WATER_LIGHT_BEND.travelSpeed;
        const wavefrontDist = depth - front;
        const envelope = Math.exp(-(wavefrontDist * wavefrontDist) / (2 * WATER_LIGHT_BEND.frontWidth * WATER_LIGHT_BEND.frontWidth));
        const settle = Math.exp(-this.age * WATER_LIGHT_BEND.decayRate);
        const magnitude = this.strength * radial * envelope * settle;
        const ripple = Math.sin(wavefrontDist * WATER_LIGHT_BEND.freq - this.age * WATER_LIGHT_BEND.oscSpeed);
        return { bend: magnitude * ripple, glow: magnitude * Math.max(0, ripple) };
    }
}

let waterLightDisturbances = [];

function spawnWaterLightDisturbance(worldX, strength) {
    const segment = findWaterSegment(worldX);
    if (!segment || strength <= 0) {
        return;
    }
    waterLightDisturbances.push(new WaterLightDisturbance(worldX, segment.surfaceY, strength));
    if (waterLightDisturbances.length > WATER_LIGHT_BEND.maxActive) {
        waterLightDisturbances.shift();
    }
}

function updateWaterLightDisturbances(dt) {
    for (const disturbance of waterLightDisturbances) {
        disturbance.update(dt);
    }
    waterLightDisturbances = waterLightDisturbances.filter((disturbance) => !disturbance.isDone());
}

function waterLightBendAt(worldX, worldY) {
    let bend = 0;
    let glow = 0;
    for (const disturbance of waterLightDisturbances) {
        const sample = disturbance.sample(worldX, worldY);
        bend += sample.bend;
        glow += sample.glow;
    }
    return { bend, glow };
}

const BG_RIPPLE = {
    amp: PIXEL_SIZE * 2,
    radius: 460,
    travelSpeed: WATER_LIGHT_BEND.travelSpeed * 1.35,
    frontWidth: WATER_LIGHT_BEND.frontWidth * 2.4,
    freq: WATER_LIGHT_BEND.freq * 0.6,
    oscSpeed: WATER_LIGHT_BEND.oscSpeed,
    decayRate: WATER_LIGHT_BEND.decayRate * 0.7,
};

function backgroundRippleBendAt(worldX, worldY) {
    if (!waterLightDisturbances.length) {
        return 0;
    }
    let bend = 0;
    for (const disturbance of waterLightDisturbances) {
        const lateral = worldX - disturbance.x;
        const vertical = worldY - disturbance.restY;
        const dist = Math.sqrt(lateral * lateral + vertical * vertical);
        const radial = Math.exp(-(dist * dist) / (2 * BG_RIPPLE.radius * BG_RIPPLE.radius));
        if (radial < 0.02) continue;
        const front = disturbance.age * BG_RIPPLE.travelSpeed;
        const wavefrontDist = dist - front;
        const envelope = Math.exp(-(wavefrontDist * wavefrontDist) / (2 * BG_RIPPLE.frontWidth * BG_RIPPLE.frontWidth));
        const settle = Math.exp(-disturbance.age * BG_RIPPLE.decayRate);
        const magnitude = (disturbance.strength / 60) * radial * envelope * settle;
        const ripple = Math.sin(wavefrontDist * BG_RIPPLE.freq - disturbance.age * BG_RIPPLE.oscSpeed);
        bend += magnitude * ripple;
    }
    return Funcs.constrain(bend, -1, 1) * BG_RIPPLE.amp;
}

//player an' water interaction 
function updatePlayerWaterSpring(dt) {
    const centerX = player.x + player.w / 2;
    const segment = findWaterSegment(centerX);
    if (!segment) {
        player.wasInWater = player.inWater;
        return;
    }
    if (player.inWater && !player.wasInWater) {
        const impactSpeed = Math.max(player.v.y, WATER_SPRING.entryMinImpact) * WATER_SPRING.entrySplashScale;
        splashWaterSurface(centerX, impactSpeed);
        spawnWaterLightDisturbance(centerX, Funcs.constrain(impactSpeed * 0.5, 10, 60));
        if (player.v.y > 0) {
            player.v.y *= WATER_SPRING.entryDamping;
        }
    } else if (!player.inWater && player.wasInWater) {
        const exitSpeed = Math.min(player.v.y, -30);
        splashWaterSurface(centerX, exitSpeed);
        spawnWaterLightDisturbance(centerX, Funcs.constrain(Math.abs(exitSpeed) * 0.35, 12, 60));
    }
    if (player.inWater) {
        const depthUnderRest = (player.y + player.h) - segment.surfaceY;
        if (depthUnderRest > -WATER_SPRING.pressBand && depthUnderRest < WATER_SPRING.pressBand) {
            const target = Funcs.constrain(depthUnderRest * 0.18, -WATER_SPRING.maxDisplacement, WATER_SPRING.maxDisplacement);
            pressWaterSurface(centerX, target, WATER_SPRING.weightPush, dt);
        }
    }
    player.wasInWater = player.inWater;
}

//render helpers for the underwater distortion pass
function ensureFrameBuffer(pad) {
    const neededW = graphics.width + pad * 2;
    if (!frameBuffer || frameBuffer.width !== neededW || frameBuffer.height !== graphics.height) {
        frameBuffer = document.createElement("canvas");
        frameBuffer.width = neededW;
        frameBuffer.height = graphics.height;
        frameBufferCtx = frameBuffer.getContext("2d");
        frameBufferCtx.imageSmoothingEnabled = false;
    }
}

//build a clip region primarily
function applyUnderwaterDistortion() {
    const waterRects = [];
    for (const block of blocks) {
        if (block.type !== "water") continue;

        if (block.isTopSurface && block.isTopSurface()) {
            const cols = 9;
            const cellW = block.w / cols;
            for (let col = 0; col < cols; col++) {
                const colX = block.x + col * cellW;
                const surfaceLine = waterSurfaceLineAt(colX + cellW / 2) ?? block.y;
                const rectY = surfaceLine;
                const rectH = (block.y + block.h) - surfaceLine;
                if (rectH <= 0) continue;

                const screenX = colX - cam.x + shake.x + graphics.width / 2;
                const screenY = rectY - cam.y + shake.y + graphics.height / 2;
                if (screenX + cellW < 0 || screenX > graphics.width || screenY + rectH < 0 || screenY > graphics.height) {
                    continue;
                }
                waterRects.push([screenX, screenY, cellW, rectH]);
            }
            continue;
        }

        const screenX = block.x - cam.x + shake.x + graphics.width / 2;
        const screenY = block.y - cam.y + shake.y + graphics.height / 2;
        //keep the clip path limited
        if (screenX + block.w < 0 || screenX > graphics.width || screenY + block.h < 0 || screenY > graphics.height) {
            continue;
        }
        waterRects.push([screenX, screenY, block.w, block.h]);
    }
    if (waterRects.length === 0) {
        return;
    }

    const pad = Math.ceil(UNDERWATER_DISTORT.amp) + 2;
    ensureFrameBuffer(pad);

    frameBufferCtx.drawImage(graphics.canvas, 0, 0, 1, graphics.height, 0, 0, pad, graphics.height);
    frameBufferCtx.drawImage(graphics.canvas, 0, 0, graphics.width, graphics.height, pad, 0, graphics.width, graphics.height);
    frameBufferCtx.drawImage(graphics.canvas, graphics.width - 1, 0, 1, graphics.height, pad + graphics.width, 0, pad, graphics.height);
    
    graphics.ctx.save();
    graphics.ctx.setTransform(1, 0, 0, 1, 0, 0);
    graphics.ctx.beginPath();
    for (const [rx, ry, rw, rh] of waterRects) {
        graphics.ctx.rect(rx, ry, rw, rh);
    }
    graphics.ctx.clip();
    graphics.ctx.imageSmoothingEnabled = false;

    const t = frameTime / 1000;
    const rowH = UNDERWATER_DISTORT.rowHeight;
    for (let y = 0; y < graphics.height; y += rowH) {
        const rh = Math.min(rowH, graphics.height - y);
        const wave = Math.sin(y * UNDERWATER_DISTORT.freq + t * UNDERWATER_DISTORT.speed);
        //quantize the shift to whole in-game pixels (multiples of PIXEL_SIZE) so the warp
        //looks like the pixel art is stepping, not sliding around at sub-pixel amounts
        const shift = Math.round((wave * UNDERWATER_DISTORT.amp) / PIXEL_SIZE) * PIXEL_SIZE;
        graphics.ctx.drawImage(
            frameBuffer,
            pad - shift, y, graphics.width, rh,
            0, y, graphics.width, rh
        );
    }
    graphics.ctx.restore();
}

/* END WATER SYSTEM*/

/* 
    BACKGROUND RENDERING
*/

let bgFrameBuffer = null;
let bgFrameBufferCtx = null;

function ensureBgFrameBuffer(pad) {
    const neededW = graphics.width + pad * 2;
    if (!bgFrameBuffer || bgFrameBuffer.width !== neededW || bgFrameBuffer.height !== graphics.height) {
        bgFrameBuffer = document.createElement("canvas");
        bgFrameBuffer.width = neededW;
        bgFrameBuffer.height = graphics.height;
        bgFrameBufferCtx = bgFrameBuffer.getContext("2d");
        bgFrameBufferCtx.imageSmoothingEnabled = false;
    }
}

function drawBackgroundArt() {
    //no active disturbances, just draw the backdrop
    if (!waterLightDisturbances.length) {
        graphics.ctx.save();
        graphics.ctx.fillStyle = "#111827";
        graphics.ctx.fillRect(0, 0, graphics.width, graphics.height);

        if (backdropSprite) {
            const pixel = PIXEL_SIZE;
            const spriteW = backdropSprite.w * pixel;
            const spriteH = backdropSprite.h * pixel;
            const offsetX = ((Math.floor(-cam.x * 0.08) % spriteW) + spriteW) % spriteW;
            for (let x = -spriteW; x < graphics.width + spriteW; x += spriteW) {
                for (let y = -spriteH; y < graphics.height + spriteH; y += spriteH) {
                    backdropSprite.draw(graphics.ctx, x + offsetX, y, pixel);
                }
            }
        }

        graphics.ctx.restore();
        return;
    }

    const pad = Math.ceil(BG_RIPPLE.amp) + 2;
    ensureBgFrameBuffer(pad);

    bgFrameBufferCtx.fillStyle = "#111827";
    bgFrameBufferCtx.fillRect(0, 0, bgFrameBuffer.width, graphics.height);

    if (backdropSprite) {
        const pixel = PIXEL_SIZE;
        const spriteW = backdropSprite.w * pixel;
        const spriteH = backdropSprite.h * pixel;
        const offsetX = ((Math.floor(-cam.x * 0.08) % spriteW) + spriteW) % spriteW;
        for (let x = -pad - spriteW; x < graphics.width + pad + spriteW; x += spriteW) {
            for (let y = -spriteH; y < graphics.height + spriteH; y += spriteH) {
                backdropSprite.draw(bgFrameBufferCtx, x + offsetX + pad, y, pixel);
            }
        }
    }

    graphics.ctx.save();
    graphics.ctx.imageSmoothingEnabled = false;
    const worldSampleX = cam.x;
    const rowH = PIXEL_SIZE;
    for (let y = 0; y < graphics.height; y += rowH) {
        const rh = Math.min(rowH, graphics.height - y);
        const worldY = y + cam.y - shake.y - graphics.height / 2;
        const bend = backgroundRippleBendAt(worldSampleX, worldY);
        //quantize to whole in-game pixels, same reasoning as the underwater distortion pass
        const shift = Funcs.constrain(Math.round(bend / PIXEL_SIZE) * PIXEL_SIZE, -pad, pad);
        graphics.ctx.drawImage(
            bgFrameBuffer,
            pad - shift, y, graphics.width, rh,
            0, y, graphics.width, rh
        );
    }
    graphics.ctx.restore();
}

/*END BACKGROUND RENDERING*/

const MAP = [
    [
        "  	   ",
        "  	                  !",
        "  	  ",
        "  	              !!",
        "	         FFF",
        "	        ####",
        "	       @   %##",
        "	        ######",
        "	#WWWWWW##  !!# #####",
        "   #WWWWWW##",
        "	 ##WWWWW#####", 
        "	 ####WWWWW#####",
        "      #WWWWWWWW########",
        "      #WWWWWWWWWW######",
        "########WWWWWWWWWW#######",
        "####WWWWWWWWWWWWWWWWW#######",
        "##WWWWWWWWWWWWWWWWWWWWW#######",
        "#######WWWWWWWWWWWWWWW######",
        "#######################",
        "",
    ],
    [
        "     ",
        " #   #",
        "#   !#",
        "     #!", 
        "#        ",
        "#@         ", 
        "####&&!# %",
        "#############",
    ],
    [
        
        "#! ! !",
        "# # # #",
        "#    ",
        "",
        "@  !",
        "# !#",
        "!  %",
        "",
        "###",
    
    ],
    [
        " ",
        " #",
        " #",
        " # @#", 
        " ###",
        " ! !##",
        "   ",
        " #  ",
        " #%###",
    ],
    [
        
        "#################",
        "    #######",
        " #####!",
        "###       ",
        "#!       !   !",
        "#     @  !   !",
        "       #########",
        " #######%",
        "####   #",
        "!#      w#######",
    ],
    [
        
        "",    
        "",
        "",
        "        #      #      #",
        "@  #    !      !      %",
        "#  !",
        "!",
    ],
    [
        "  ##!",
        "  !###",    
        " ## ###",
        " #! #!",
        "  # ##@",
        "  % ####       %",
        "    ############",
    ],
    [],
];




/** Player */
const player = {
    //Starting x and y coords
    x: 300,
    y: 300,
    
    //The width and height
    w: BLOCK_SIZE - 5,
    h: 65,
    
    collide: {
        left: false,
        right: false,
        top: false,
        bottom: false
    },
    inputs: {
        left: null,
        right: null,
        up: null,
    },
    v: {
        x: 0,
        y: 0,
    },
    jump: false,
    
    acceleration: 1600,
    friction: 1.1,
    jumpPow: 420,
    gravity: 600,
    speed: 200,
    
    //Players health num
    health: 10,
    //Is the player on any of these blocks?
    onTramp: false,
    onIce: false,
    onMud: false,
    inWater: false,
    wasInWater: false,

    //facing direction for sprite flip, animation bookkeeping
    dir: 1,
    animState: "idle",
    animFrame: 0,
    animTimer: 0,
    
    collideX: function(that){
        //first check if the player is touching a block
        if(Funcs.edgeCheck(this, that)){
            if(that.type === "hazard"){
                this.health -= 10;
            }
            else if(that.type === "portal"){
                nxt = true;
            }
            //vector velocity can determine what side
            else if(this.v.x > 0){
                this.collide.right = true;
                this.x = that.x - this.w;
            }
            else {
                this.collide.left = true;
                this.x = that.x + that.w;
            }
            
            //the player is colliding
            that.colX = true;
            return true;
        }
        //the player is not colliding on the x-axis
        this.collide.left = false;
        this.collide.right = false;
        that.colX = false;
        return false;
    },
    collideY: function(that){
        //is the player touching a block?
        if(Funcs.edgeCheck(this, that)){
            
            if(this.type === "ice"){
                //no work
                this.acceleration = 4;
                this.speed = 10;
                this.friction = 1;
            }
            if(that.type === "hazard"){
                this.health -= 10;
            }
            else if(that.type === "portal"){
                nxt = true;
            }
            //vector velocity can determine orientation
            else if(this.v.y > 0){
                shakes.push(new Shake(this.v.y/60))
                this.collide.top = true;
                this.y = that.y - this.h;
                this.v.y = 0;
            }
            else {
                this.collide.bottom = true;
                this.y = that.y + that.h;
                this.v.y *= -0.1;
            }
            
            
            //the player is colliding on the y-axis
            that.colY = true;
            return true;
        }
        //the player is not colliding on the y-axis
        this.collide.top = false;
        this.collide.bottom = false;
        that.colY = false;
        return false;
    },
    
    moveX: function(){
        this.inputs.left = (keys[37] || keys[65]);
        this.inputs.right = (keys[39] || keys[68]);
        
        if (this.inWater) {
            const centerX = this.x + this.w / 2;
            const surfaceLine = waterSurfaceLineAt(centerX);
            const headDepth = surfaceLine === null ? 999 : surfaceLine - this.y;
            const atSurface = headDepth > 0 && headDepth < WATER_SPRING.skimBand;
            const accelMul = atSurface ? WATER_SPRING.skimAccelMul : 0.35;
            const speedMul = atSurface ? WATER_SPRING.skimSpeedMul : 0.7;

            if (this.inputs.left) {
                this.v.x -= this.acceleration * accelMul * dt;
            } else if (this.inputs.right) {
                this.v.x += this.acceleration * accelMul * dt;
            } else {
                this.v.x *= 0.94;
            }
            this.v.x = Funcs.constrain(this.v.x, -this.speed * speedMul, this.speed * speedMul);
            this.x += this.v.x * dt;
            this.action = "air";
            return;
        }
        
        //vector movement
        if(this.inputs.left && !this.collide.left){
            this.v.x -= this.acceleration * dt;
            if(!this.collide.top){
                this.action = "air";
            }
            else if(!this.collide.right){
                this.action = "walk";
            }
            else {
                this.action = "idle";
            }
            this.dir = -1;
        }
        else if (this.inputs.right && !this.collide.right) { 
            this.v.x += this.acceleration * dt;
            if(!this.collide.top){
                this.action = "air";
            }
            else if(Math.abs(this.v.x) > 0.1){
                this.action = "walk";
            }
            else {
                this.action = "idle";
            }
            this.dir = 1;
        }
        else {
            this.v.x /= this.friction; 
            if(this.collide.top){
                this.action = "idle";
            }
        }
        
        //fixes an annoying bug
        if(this.v.x !== 0){
            this.x += this.v.x * dt;
        }
        this.v.x = Funcs.constrain(this.v.x, -this.speed, this.speed);
    },
    moveY: function(){
        this.inputs.up = (keys[38] || keys[87]);
        this.inputs.down = (keys[40] || keys[83]);

        if (this.inWater) {
            const centerX = this.x + this.w / 2;
            const surfaceLine = waterSurfaceLineAt(centerX);
            const headDepth = surfaceLine === null ? 999 : surfaceLine - this.y;

            if (this.inputs.up) {
                //swim up
                this.v.y -= this.jumpPow * 0.55 * dt;
                const band = WATER_SPRING.tensionBand;
                if (headDepth > 0 && headDepth < band) {
                    this.v.y += WATER_SPRING.surfaceTension * (1 - headDepth / band) * dt;
                }
            } else if (this.inputs.down) {
                //swim down when holding down
                this.v.y += this.jumpPow * 0.6 * dt;
            } else {
                //slight natural sinking
                this.v.y += this.gravity * 0.12 * dt;
            }

            const atSurface = headDepth > 0 && headDepth < WATER_SPRING.skimBand;
            if (atSurface && !this.inputs.down && (this.inputs.left || this.inputs.right)) {
                this.v.y -= WATER_SPRING.skimLift * dt;
            }

            //no vertical damping (reduced)
            this.v.y *= 0.988;
            this.v.y = Funcs.constrain(this.v.y, -WATER_SPRING.maxSwimSpeed, WATER_SPRING.maxSwimSpeed);
            this.y += this.v.y * dt;
            this.action = "air";
            return;
        }
            
        if (this.inputs.up && this.collide.top) {
            this.v.y = -this.jumpPow;
            this.action = "air";
        }
        this.v.y += this.gravity * dt;
        this.y += this.v.y * dt;
        if(!this.collide.top) {
            this.action = "air";
        }
    },

    //Merge into one function
    display: function() {
        graphics.ctx.fillStyle = "rgb(100, 255, 100)";
        //ctx.fillRect(this.x, this.y, this.w, this.h);
        

        //pick which animation set to play based on current movement state
        let stateKey;
        if (this.inWater) {
            stateKey = "fall";
        } else if (!this.collide.top) {
            stateKey = this.v.y < 0 ? "jump" : "fall";
        } else if (Math.abs(this.v.x) > 8) {
            stateKey = "run";
        } else {
            stateKey = "idle";
        }
        const set = playerSprites[stateKey] || playerSprites.idle;
        if (!set || !set.length) {
            graphics.ctx.fillStyle = "rgb(100, 255, 100)";
            graphics.ctx.fillRect(this.x, this.y, this.w, this.h);
            return;
        }

        //reset the animation when switching states so it always starts on frame 0
        if (stateKey !== this.animState) {
            this.animState = stateKey;
            this.animFrame = 0;
            this.animTimer = 0;
        }

        //faster leg cycling the faster the player is actually moving
        const frameDuration = stateKey === "run"
            ? Funcs.constrain(0.16 - Math.abs(this.v.x) / this.speed * 0.1, 0.045, 0.16)
            : 0.12;

        if (set.length > 1) {
            this.animTimer += dt;
            while (this.animTimer >= frameDuration) {
                this.animTimer -= frameDuration;
                this.animFrame = (this.animFrame + 1) % set.length;
            }
        } else {
            this.animFrame = 0;
        }

        if (this.v.x > 8) this.dir = 1;
        else if (this.v.x < -8) this.dir = -1;

        const frame = set[Math.min(this.animFrame, set.length - 1)];
        const spriteW = frame.w * PIXEL_SIZE;
        const spriteH = frame.h * PIXEL_SIZE;

        const rawX = this.x + this.w / 2 - spriteW / 2 - 3;
        const rawY = this.y + this.h - spriteH + 10;
        const drawX = Math.round(rawX / PIXEL_SIZE) * PIXEL_SIZE;
        const drawY = Math.round(rawY / PIXEL_SIZE) * PIXEL_SIZE;

        frame.draw(graphics.ctx, drawX, drawY, PIXEL_SIZE, this.dir);
    }
};


    
/* Block */
class Block {
    constructor(x, y, w, h, type) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.type = type;
    }
    draw() {
        switch (this.type) {
            case "block":
                if (tileSprite) {
                    tileSprite.draw(graphics.ctx, this.x, this.y, Math.max(1, this.w / tileSprite.w));
                } else {
                    graphics.ctx.fillStyle = "rgb(66, 66, 59)";
                    graphics.ctx.fillRect(this.x, this.y, this.w, this.h);
                }
                break;
            case "portal":
                graphics.ctx.fillStyle = "rgb(200, 100, 200)";
                graphics.ctx.fillRect(this.x, this.y, this.w, this.h);
                // if (Funcs.edgeCheck(player, this)) {
                //     
                // }
                //Physics.collideBox.all(player, this);
                break;
            case "tramp":
                graphics.ctx.fillStyle = "rgb(255, 255, 100)";
                graphics.ctx.fillRect(this.x, this.y, this.w, this.h);
                // if (Physics.collideBox.touch(player, this)) {
                //     player.onTramp = true;
                // }
                // Physics.collideBox.all(player, this);
                break;
            case "ice":
                graphics.ctx.fillStyle = "rgb(100, 100, 200)";
                graphics.ctx.fillRect(this.x, this.y, this.w, this.h);
                // if (Physics.collideBox.touch(player, this)) {
                //     player.onIce = true;
                // }
                // Physics.collideBox.all(player, this);
                break;
            case "mud":
                graphics.ctx.fillStyle = "rgb(100, 30, 0)";
                graphics.ctx.fillRect(this.x, this.y, this.w, this.h);
                if (Physics.collideBox.touch(player, this)) {
                    player.onMud = true;
                }
                Physics.collideBox.all(player, this);
                break;
            case "hazard":
                graphics.ctx.fillStyle = "rgb(255, 100, 100)";
                graphics.ctx.fillRect(this.x, this.y, this.w, this.h);

                
                // if(Funcs.edgeCheck(player, this)){
                //     alert();
                //     player.health -= 10;
                // }
                
                //Physics.collideBox.all(player, this);
                break;
        }
    }
}

//part of the WATER SYSTEM above; kept here (not up there) only because itmust be declared after Block, which it extends
class WaterBlock extends Block {
    constructor(x, y, w, h) {
        super(x, y, w, h, "water");
    }

    isTopSurface() {
        const above = blocks.find((block) => block.x === this.x && block.y === this.y - BLOCK_SIZE);
        const aboveIsWater = above?.type === "water";
        const aboveIsSolid = above && ["block", "ice", "mud", "tramp", "portal", "hazard"].includes(above.type);
        return !aboveIsWater && !aboveIsSolid;
    }

    draw() {
        const topSurface = this.isTopSurface();
        drawWaterTile(this.x, this.y, this.w, this.h, topSurface);
    }
}

const RAIN = {
    enabled: true,
    angleDeg: 20,
    speed: 820,
    speedVariance: 0.35,
    angleJitterDeg: 0,
    maxDropsPerLayer: 1600,
    splashColor: "#eaf8ff",

    layers: {
        back: {
            enabled: true,
            collide: false,
            parallax: 0.55,
            speedScale: 0.8,
            density: 40,
            pixelSize: PIXEL_SIZE,
            dropLength: 3,
            dropLengthVariance: 0.6,
            alphaScale: 0.7,
            color: "#3f5c78",
        },
        mid: {
            enabled: true,
            collide: true,
            parallax: 1,
            speedScale: 1,
            density: 20,
            pixelSize: PIXEL_SIZE,
            dropLength: 4,
            dropLengthVariance: 0.75,
            alphaScale: 1,
            color: "#bcdcff",
        },
        front: {
            enabled: true,
            collide: false,
            parallax: 1.45,
            speedScale: 1.25,
            density: 7,
            pixelSize: PIXEL_SIZE * 2,
            dropLength: 5,
            dropLengthVariance: 0.5,
            alphaScale: 1,
            color: "#eaf6ff",
        },
    },
};
window.RAIN = RAIN;

const RAIN_SOLID_TYPES = new Set(["block", "hazard", "portal", "tramp", "mud", "ice"]);

let rainLayers = {};
let rainSplashes = [];

function initRainLayers() {
    rainLayers = {};
    for (const key in RAIN.layers) {
        rainLayers[key] = { drops: [], spawnAccumulator: 0 };
    }
}

function blockAt(worldX, worldY) {
    const col = Math.floor(worldX / BLOCK_SIZE);
    const row = Math.floor(worldY / BLOCK_SIZE);
    return blockGrid.get(col + "," + row) || null;
}

class RainSplashParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 0;
        this.maxLife = 0.12 + Math.random() * 0.1;
    }
    update(dt) {
        this.life += dt;
        return this.life < this.maxLife;
    }
    draw() {
        const t = Funcs.constrain(1 - this.life / this.maxLife, 0, 1);
        graphics.ctx.globalAlpha = t * 0.85;
        graphics.ctx.fillStyle = this.color;
        const px = Math.round(this.x / PIXEL_SIZE) * PIXEL_SIZE;
        const py = Math.round(this.y / PIXEL_SIZE) * PIXEL_SIZE;
        graphics.ctx.fillRect(px, py, PIXEL_SIZE, PIXEL_SIZE);
    }
}

function spawnImpactSplash(x, y) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const offsetX = Math.round((Math.random() - 0.5) * 3) * PIXEL_SIZE;
        const offsetY = Math.round((Math.random() - 0.5) * 2) * PIXEL_SIZE;
        rainSplashes.push(new RainSplashParticle(x + offsetX, y + offsetY, RAIN.splashColor));
    }
}

class RainDrop {
    constructor(x, y, layer) {
        this.x = x;
        this.y = y;
        this.alive = true;
        this.layer = layer;

        const jitter = (Math.random() - 0.5) * 2 * RAIN.angleJitterDeg;
        const angleRad = (RAIN.angleDeg + jitter) * Math.PI / 180;
        const spd = RAIN.speed * layer.speedScale * (1 + (Math.random() - 0.5) * 2 * RAIN.speedVariance);
        this.vx = Math.sin(angleRad) * spd;
        this.vy = Math.cos(angleRad) * spd;
        this.alpha = (0.5 + Math.random() * 0.4) * layer.alphaScale;
        this.len = Math.max(1, Math.round(
            layer.dropLength * (1 + (Math.random() - 0.5) * 2 * layer.dropLengthVariance)
        ));
    }

    update(dt) {
        const nx = this.x + this.vx * dt;
        const ny = this.y + this.vy * dt;

        if (this.layer.collide) {
            if (nx >= player.x && nx <= player.x + player.w && ny >= player.y && ny <= player.y + player.h) {
                this.alive = false;
                spawnImpactSplash(nx, ny);
                return;
            }

            const hit = blockAt(nx, ny);
            if (hit) {
                if (hit.type === "water") {
                    const isSurface = hit.isTopSurface && hit.isTopSurface();
                    const surfaceLine = isSurface ? (waterSurfaceLineAt(nx) ?? hit.y) : hit.y;

                    if (!isSurface || ny >= surfaceLine) {
                        this.alive = false;
                        const impact = Funcs.constrain(Math.abs(this.vy) * 0.12, 6, 42);
                        splashWaterSurface(nx, impact);
                        if (Math.random() < 0.45) {
                            spawnWaterLightDisturbance(nx, Funcs.constrain(impact * 0.5, 6, 24));
                        }
                        spawnImpactSplash(nx, surfaceLine);
                        return;
                    }
                } else if (RAIN_SOLID_TYPES.has(hit.type)) {
                    this.alive = false;
                    spawnImpactSplash(nx, Math.min(ny, hit.y));
                    return;
                }
            }
        }

        this.x = nx;
        this.y = ny;

        if (this.y > lvlSizeY + 900 || this.x < -1200 || this.x > lvlSizeX + 1200) {
            this.alive = false;
        }
    }

    draw() {
        const dirLen = Math.hypot(this.vx, this.vy) || 1;
        const ux = this.vx / dirLen;
        const uy = this.vy / dirLen;
        const size = this.layer.pixelSize;

        const factor = this.layer.parallax;
        const baseX = this.x + cam.x * (1 - factor);
        const baseY = this.y + cam.y * (1 - factor);

        graphics.ctx.globalAlpha = this.alpha;
        graphics.ctx.fillStyle = this.layer.color;
        for (let s = 0; s < this.len; s++) {
            const px = Math.round((baseX - ux * s * size) / PIXEL_SIZE) * PIXEL_SIZE;
            const py = Math.round((baseY - uy * s * size) / PIXEL_SIZE) * PIXEL_SIZE;
            graphics.ctx.fillRect(px, py, size, size);
        }
    }
}

function updateRainLayers(dt) {
    const angleRad = RAIN.angleDeg * Math.PI / 180;

    for (const key in RAIN.layers) {
        const layer = RAIN.layers[key];
        const state = rainLayers[key];
        if (!state) continue;

        if (!RAIN.enabled || !layer.enabled) {
            state.drops.length = 0;
            continue;
        }

        const factor = layer.parallax;
        const centerX = cam.x * factor;
        const centerY = cam.y * factor;

        const spawnMarginY = 160;
        const spawnY = centerY - graphics.height / 2 - spawnMarginY;
        const slant = Math.abs(Math.tan(angleRad)) * (graphics.height + spawnMarginY);
        const spawnLeft = centerX - graphics.width / 2 - slant - 80;
        const spawnRight = centerX + graphics.width / 2 + slant + 80;
        const spawnWidth = spawnRight - spawnLeft;

        state.spawnAccumulator += layer.density * (spawnWidth / 1000) * dt;
        while (state.spawnAccumulator >= 1 && state.drops.length < RAIN.maxDropsPerLayer) {
            state.spawnAccumulator -= 1;
            const x = spawnLeft + Math.random() * spawnWidth;
            const y = spawnY - Math.random() * 260;
            state.drops.push(new RainDrop(x, y, layer));
        }
    }

    for (const key in rainLayers) {
        const drops = rainLayers[key].drops;
        for (let i = drops.length - 1; i >= 0; i--) {
            drops[i].update(dt);
            if (!drops[i].alive) drops.splice(i, 1);
        }
    }
    for (let i = rainSplashes.length - 1; i >= 0; i--) {
        if (!rainSplashes[i].update(dt)) rainSplashes.splice(i, 1);
    }
}

function drawRainLayer(key) {
    const state = rainLayers[key];
    if (!state || state.drops.length === 0) {
        if (key !== "mid" || rainSplashes.length === 0) return;
    }
    graphics.ctx.save();
    graphics.ctx.imageSmoothingEnabled = false;
    if (state) {
        for (const drop of state.drops) drop.draw();
    }
    if (key === "mid") {
        for (const splash of rainSplashes) splash.draw();
    }
    graphics.ctx.globalAlpha = 1;
    graphics.ctx.restore();
}

//Smooth max function my hero
let smax = (a,b,epsilon) => {
    return (a + b + Math.sqrt((a - b) * (a - b) + epsilon)) / 2;
}

let radiation = (temp, alpha = 1) => {
    //There are two regimes here: The "cold" regime under 270 K, in which all of the colors spike to blue/white. Just a linear function.
    //The second regime is the regime in which the hot metal releases thermal radiation. I just use some cubic interpolation.
    //To combine the two I use the smooth max function.
    let x, y, r, g, b;
    //Normalize from 0-1
    temp /= 1000;
    // 3x^2-2x^3 cubic polynomial.
    x = 3 * temp * temp - 2 * temp * temp * temp;
    //Linear (cold)
    y = -18 * (temp - 0.24);
    r = smax(x, y, 0.1);
    //Linear (cold)
    x = -24 * (temp - 0.22);
    //-16x^3+36x^2-24x+5. This polynomial is shifted to interpolate from 0.5 to 1, since I don't want green early on. It's zero otherwise. I also multiply a little since there is too much green at the peak.
    y = temp < 0.5 ? 0 : (0.95 * (-16 * temp * temp * temp + 36 * temp * temp - 24 * temp + 5));
    g = smax(x, y, 1.4);
    //Linear (Cold)
    x = -20 * (temp - 0.2);
    //There is only blue at the very end.
    y = temp < 0.8 ? 0 : 2 * (temp - 0.8);
    b = 2*smax(x, y, 1);
    return [255*r,255*g,255*b];
}

class Fire{
    static OCTAVES = 8;
    static AMPLITUDE = 0.6;
    static SPEED = 0.04;
    static FREQUENCY = 0.02;
    static EXP = 1.6;
    static EXP2 = 1.4;
    static gridSize = 5;
    static #cachedRadiance;
    static get cachedRadiance(){
        if(Fire.#cachedRadiance) return Fire.#cachedRadiance;
        let cachedRadiance = new Float32Array(3000);
        for(let i = 0; i < 1000; i++){
            let result = radiation(i);
            cachedRadiance[3*i] = result[0];
            cachedRadiance[3*i+1] = result[1];
            cachedRadiance[3*i+2] = result[2];
        }
        return Fire.#cachedRadiance = cachedRadiance;
    }
    constructor(x,y,w,h){
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.t = 0;
        this.img = graphics.ctx.createImageData(~~(this.w/Fire.gridSize),~~(this.h/Fire.gridSize));
        this.canvas = new OffscreenCanvas(this.w/Fire.gridSize,this.h/Fire.gridSize);
        this.ctx = this.canvas.getContext('2d');
    }
    get pw(){
        return this.w/Fire.gridSize;
    }
    get ph(){
        return this.h/Fire.gridSize;
    }
    get data(){
        return this.img.data;
    }
    get frequency(){
        return Fire.FREQUENCY*Fire.gridSize;
    }
    sampleAt(x,y){
        let ang = 0.77;
        let mat = [[Math.cos(ang), -Math.sin(ang)],[Math.sin(ang), Math.cos(ang)]], posY, sphase;
        let rot = (mat) =>{
            return [[mat[0][0] * mat[0][0] + mat[1][0] * mat[0][1], mat[0][0] * mat[0][1] + mat[0][1] * mat[1][1]],[mat[0][0] * mat[1][0] + mat[1][0] * mat[1][1], mat[0][1]*mat[1][0] + mat[1][1]*mat[1][1]]];
        }
        mat = rot(mat);
        let smoothstep = (a,b,x) =>{
            let t = Math.min(1,Math.max(0,(x-a)/(b-a)));
            return t*t*(3-2*t)
        }
        let samplePos = {'x': x, 'y': y};
        let freq = this.frequency, mult = this.frequency;
        
        let xstretch = 2-2.5*smoothstep(-2,2,(samplePos.y/this.ph-1/2));
        let ystretch = 1-0.5/(1+(2*x/this.pw-1)*(2*x/this.pw-1));
        samplePos.x = (samplePos.x-this.pw/2)*xstretch+this.pw/2;
        samplePos.y = (samplePos.y-this.ph/2)*ystretch+this.ph/2;
        
        for(let i = 0; i < Fire.OCTAVES; i++){
            posY = mat[0][0] * samplePos.x + mat[1][0] * samplePos.y;
            sphase = Math.sin(freq * posY + Fire.SPEED * (this.t+i)*(0.2*i+1) + i);
            samplePos.x += Fire.AMPLITUDE * mat[0][1] * sphase / (mult);
            samplePos.y += Fire.AMPLITUDE * mat[0][0] * sphase / (mult) + this.t/6;
            
            mat = rot(mat);
            freq *= Fire.EXP; 
            mult *= Fire.EXP2;
        }
        return samplePos;
    }
    update(tex){
        this.t++;
        let mod = (t,a) =>{
            return t-a*Math.floor(t/a);
        }
        let func = (t) =>{
            return 1.5*t*t-0.3;
        }
        let smoothstep = (a,b,x) =>{
            let t = Math.min(1,Math.max(0,(x-a)/(b-a)));
            return t*t*(3-2*t);
        }
        const edgeFeather = Math.max(1, this.pw * 0.22);
        for(let x = 0; x <  this.pw; x+=1){
            const edgeDist = Math.min(x, this.pw - 1 - x);
            const edgeAttenuator = smoothstep(0, edgeFeather, edgeDist);
            for(let y = 0; y < this.ph; y+=1){
                let i = 4 * (this.w * y / Fire.gridSize + x);
                let texPos = this.sampleAt(mod(x,600),mod(y,600));
                let texIdx = 4 * (600 * ~~(texPos.y%600) + ~~(texPos.x%600));
                let temp = 300+tex.data[texIdx]*2;
                let attenuator = (y/this.ph)*(y/this.ph)*(y/this.ph)*edgeAttenuator;
                
                this.data[i] = Fire.cachedRadiance[~~temp*3];
                this.data[i+1] = Fire.cachedRadiance[~~temp*3+1];
                this.data[i+2] = Fire.cachedRadiance[~~temp*3+2];
                this.data[i+3] = attenuator*Math.pow(150*func(tex.data[texIdx]/255)+127,1.5);
            }
        }
    }
    draw(ctx){
        this.ctx.putImageData(this.img, 0, 0);
        graphics.ctx.drawImage(this.canvas,this.x, this.y, this.w, this.h);
    }
}

class FireBlock extends Block {
    constructor(x, y, w, h) {
        super(x, y, w, h, "fire");
        const riseHeight = h * 4;
        this.fire = new Fire(x, y - (riseHeight - h), w, riseHeight);
    }
    update(tex) {
        this.fire.update(tex);
    }
    draw() {
        this.fire.draw(graphics.ctx);
    }
}


async function toBitmap(dataUrl) {
    const bin = atob(dataUrl);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    const decoder = new ImageDecoder({ data: bytes.buffer, type: "image/png" });
    await decoder.tracks.ready;
    const frame = (await decoder.decode()).image;
    const bitmap = await createImageBitmap(frame);
    return bitmap;
}

graphics.ctx.drawImage(await toBitmap(texStr.img),0,0);
let texture = graphics.ctx.getImageData(0,0,600,600);
graphics.ctx.fillRect(0,0,600,600);
graphics.ctx.imageSmoothingEnabled = false;



const scarf = new Fabric({
    x: player.x,
    y: player.y + 50,
    cols: 5,
    rows: 9,
    spacing: 5,
    lockedTop: false,
    stiffness: 0.8,
    shapeMap: [
        '1111111111111',
        '1111111111   ',
        '111111111    ',
        '11111111     ',
        '11111111     ',
        '11111111     ',
        '11111111     ',
        '11111111     ',
        
    ]
})

scarf.init();

for (let x = 0; x < scarf.cols; x++) {
    let point = scarf.points[x];

    point.parent = player;

    point.offsetX = x * scarf.spacing - 7;
    point.offsetY = 30;
}



/**
 * 
 * Thank you so much Mushy Avocado!
 * 
 * Contstructors by Mushy Avocado, comments by me
 * 
 **/

//defines a rectangular area with functions to calculate boundaries from two points
class Bounds {
    //creates a Bounds instance by determining top-left origin and dimensions from any two corners
    static fromCorners(x1, y1, x2, y2) {
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const width = Math.abs(x1 - x2);
        const height = Math.abs(y1 - y2);
        return new Bounds(x, y, width, height);
    }

    //horizontal and vertical origin
    x = 0;
    y = 0;

    width = 0;
    height = 0;


    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    //right edge coordinate
    get maxX() {
        return this.x + this.width;
    }

    //bottom edge coordinate
    get maxY() {
        return this.y + this.height;
    }
}

//coordinate conversions between world space and a fixed-size grid system
class Grid {
    //default pixel size of a single grid cell
    size = 40;


    setSize(value) {
        this.size = value;
    }

    //converts cell index to pixel coordinate and vice-versa
    cellToWorld(x) {
        return x * this.size;
    }
    worldToCell(x) {
        return Math.floor(x / this.size);
    }

    //calculates which grid cell indices are covered by a specific world-space bounds object
    getIndicesFromBounds(bounds) {
        return Bounds.fromCorners(
            Math.floor(bounds.x / this.size),
            Math.floor(bounds.y / this.size),
            Math.ceil(bounds.maxX / this.size),
            Math.ceil(bounds.maxY / this.size)
        );
    }

    //generator that iterates through every cell coordinate within the provided bounds
    * visitCells(bounds) {
        const indexBounds = this.getIndicesFromBounds(bounds);
        for (let x = indexBounds.x; x < indexBounds.maxX; x++) {
            for (let y = indexBounds.y; y < indexBounds.maxY; y++) {
                yield {
                    x,
                    y
                };
            }
        }
    }

}



//A 2D data structure for storing and retrieving values (like characters or light levels) at coordinates
class Raster {
    //nested array representing rows and columns
    data = [];

    set(x, y, value) {
        if (!this.data[y]) {
            this.data[y] = [];
        }
        this.data[y][x] = value;
    }

    //retrieves value or returns null if undefined
    get(x, y) {
        return this.data[y]?.[x] ?? null;
    }

    //resets entire data set
    clear() {
        this.data.length = 0;
    }


    //static factory that converts strings or 2D arrays into a populated Raster instance
    static fromBitmap(bitmap, converter = null) {
        const raster = new Raster();
        if (typeof bitmap === "string") {
            bitmap = bitmap.split("\n");
        }
        bitmap.forEach((row, y) => {
            if (typeof row === "string") {
                row = row.split("");
            }
            row.forEach((symbol, x) => {
                if (converter) {
                    raster.set(x, y, converter(x, y, symbol));
                } else {
                    raster.set(x, y, symbol);
                }
            });
        });
        return raster;
    }
}


//calculates light propagation across a grid based on cell types and decay settings
class Lighting {
    //stores calculated light intensity per cell
    data = new Raster();

    constructor(grid, palette, settings) {
        //reference to the grid scale
        this.grid = grid;
        //mapping of symbols to properties like solidity and emission
        this.palette = palette;
        //configuration for light decay and minimum levels
        this.settings = settings;
        this.playerLightRadius = settings.playerLightRadius ?? 4;
        this.playerLightStrength = settings.playerLightStrength ?? 0.95;
        //how quickly cells update to new light values (0 = no change, 1 = instant)
        this.smoothing = settings.lightSmooth ?? 0.14;
    }

    //Checks if a cell blocks light
    isSolid(symbol) {
        return !!(this.palette[symbol]?.isSolid);
    }

    //Gets base brightness of a cell
    getEmission(symbol) {
        return this.palette[symbol]?.emission ?? 0;
    }

    //Calculates a cell's light level by diffusing light from neighbors and applying decay
    getLightLevel(x, y, symbol) {
        const targetIsSolid = this.isSolid(symbol);
        const neighborCoords = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
        ];

        let highestNeighbor = 0;
        for (const [nx, ny] of neighborCoords) {
            //light only reaches a cell by traveling through open space
            if (!targetIsSolid && this.isSolid(levelArray?.get(nx, ny))) {
                continue;
            }
            const level = this.data.get(nx, ny);
            if (level !== null && level > highestNeighbor) {
                highestNeighbor = level;
            }
        }

        //apply different decay rates depending on whether the light is passing through a solid or air
        const propagatedLight = Math.max(highestNeighbor * (targetIsSolid ? this.settings.groundDecay : this.settings.airDecay), this.settings.minLevel);

        const playerCellX = Math.floor(player.x / this.grid.size);
        const playerCellY = Math.floor(player.y / this.grid.size);
        const dx = Math.abs(x - playerCellX);
        const dy = Math.abs(y - playerCellY);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const playerLight = distance <= this.playerLightRadius
            ? Math.max(this.settings.minLevel, this.playerLightStrength * (1 - distance / this.playerLightRadius))
            : 0;

        const emission = this.getEmission(symbol);
        const target = Math.max(propagatedLight, playerLight, emission);
        const previous = this.data.get(x, y) ?? target;
        const smoothed = Funcs.lerp(previous, target, this.smoothing);
        this.data.set(x, y, smoothed);
        return smoothed;
    }

}

let grid = null;
let levelArray = null;
let camera = null;
let lighting = null;


//const worldBounds = new Bounds(0, 0, width, height);

function updateAndRenderLighting(lighting) {
    for (let {
            x,
            y
        }
        of lighting.grid.visitCells(camera)) {
        const symbol = levelArray.get(x, y);
        graphics.ctx.fillStyle = `rgba(0, 0, 0, ${ 1- lighting.getLightLevel(x, y, symbol)})`;

        graphics.ctx.fillRect(lighting.grid.cellToWorld(x), lighting.grid.cellToWorld(y), lighting.grid.size, lighting.grid.size);
    }
}

let lvlSizeX = 0;
let lvlSizeY = 0;

function mapSetup(LEVEL) {
    blocks = [];
    
    //let MAP = LEVEL;
    let longestX = 0;
    
    //create blocks and player
    for (let i = 0; i < MAP[LEVEL].length; i++) {
        for (let j = 0; j < MAP[LEVEL][i].length; j++) {
            const sym = MAP[LEVEL][i][j];
            switch (sym) {
                case "#":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "block"));
                    break;
                case "!":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "hazard"));
                    break;
                case "%":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "portal"));
                    break;
                case "$":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "tramp"));
                    break;
                case "_":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "mud"));
                    break;
                case "&":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "ice"));
                    break;
                case "W":
                    blocks.push(new WaterBlock(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE));
                    break;
                case "F": {
                    let runEnd = j;
                    while (MAP[LEVEL][i][runEnd + 1] === "F") {
                        runEnd++;
                    }
                    blocks.push(new FireBlock(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE * (runEnd - j + 1), BLOCK_SIZE));
                    j = runEnd;
                    break;
                }
                case "@":
                    player.x = j * BLOCK_SIZE;
                    player.y = i * BLOCK_SIZE;
                    break;
            }
            if (player.health <= 0 && MAP[LEVEL] && MAP[LEVEL][i] && MAP[LEVEL][i][j] === "@") {
                player.x = j * BLOCK_SIZE;
                player.y = i * BLOCK_SIZE;
                player.health = 10;
            }
        }
        
        if(MAP[LEVEL][i].length > longestX){
            longestX = MAP[LEVEL][i].length;
        }
    }
    
    blockGrid = new Map();
    for (const block of blocks) {
        const colStart = Math.round(block.x / BLOCK_SIZE);
        const colEnd = Math.round((block.x + block.w) / BLOCK_SIZE) - 1;
        const row = Math.round(block.y / BLOCK_SIZE);
        for (let col = colStart; col <= colEnd; col++) {
            blockGrid.set(col + "," + row, block);
        }
    }
    initRainLayers();
    rainSplashes = [];
    
    
    //fetch the width and height of each level in pixels
    lvlSizeX = longestX * BLOCK_SIZE;
    lvlSizeY = MAP[LEVEL].length * BLOCK_SIZE;

    //record the topmost water tile's y for each column, so the light beams know how deep they are and can fade out accordingly.
    waterSurfaceByColumn = {};
    for (const block of blocks) {
        if (block.type !== "water") continue;
        if (waterSurfaceByColumn[block.x] === undefined || block.y < waterSurfaceByColumn[block.x]) {
            waterSurfaceByColumn[block.x] = block.y;
        }
    }
    buildWaterSurfaceSegments();
    waterLightDisturbances = [];


    lightStreaksWide = createLightStreaks(lvlSizeX, {
        minWidth: 18, maxWidth: 65,
        minGap: 10, maxGap: 95,
        minOpacity: 0.16, maxOpacity: 0.55,
        swayAmp: 20,
        tilt: WATER_TILT_PER_ROW,
        palette: ["#3f96da", "#4fc3ff", "#63cdff", "#7fd6ee"],
    });
    lightStreaksFine = createLightStreaks(lvlSizeX, {
        minWidth: 6, maxWidth: 20,
        minGap: 15, maxGap: 110,
        minOpacity: 0.3, maxOpacity: 0.95,
        swayAmp: 12,
        tilt: WATER_TILT_PER_ROW,
        palette: ["#bff2ff", "#e2fbff", "#9fe6ff", "#d0f6ff"],
    });
    
    //alert(lvlSizeX)
    //lighting setup
    grid = new Grid();
    grid.setSize(BLOCK_SIZE);
    levelArray = Raster.fromBitmap(MAP[LEVEL]);
    camera = new Bounds(-graphics.width, -graphics.height, lvlSizeX + graphics.width + graphics.width/2, lvlSizeY + graphics.height + graphics.height/2);
    lighting = new Lighting(grid, {
        "!": {
            emission: 1,
        },
        "%": {
            emission: 1,
        },
        "#": {
            isSolid: true,
        },
    }, {
        airDecay: 0.9,
        groundDecay: 0.7,
        minLevel: 0.08,
        playerLightRadius: 5,
        playerLightStrength: 0.95,
    });
    
}

//camera shake
const shakes = []; 
let shake = {
    x: 0,
    y: 0,
};
const Shake = (function () {
    let Shake = function (n) {
        //shake power
        this.n = n;
    };
    Shake.prototype = {
        active: function(increment){
            //apply shake
            shake.x = (Math.random()*2-1)*this.n;
            shake.y = (Math.random()*2-1)*this.n;
            
            //fade the shake
            this.n -= 0.5;
            
            if (this.n < 0) {
                shake.x = 0;
                shake.y = 0;
                shakes.splice(increment, 1);
            }
        }
    };
    return Shake;
})();

/* Camera object */
const cam = {
    x: player.x,
    y: player.y,
    z: 1,
    update() {
        this.x = Funcs.lerp(this.x, player.x * this.z, 0.1);
        this.y = Funcs.lerp(this.y, player.y * this.z, 0.1);
        graphics.ctx.translate(~~(-this.x + shake.x + graphics.width / 2 ), ~~(-this.y + shake.y + graphics.height / 2));
        graphics.ctx.scale(this.z, this.z);
    },
};

let freeze = false;
let timer = 0;
    
/* Run key functions */
function app() {
    if (player.y > (lvlSizeY + 40)) {
        player.health--;
    }
    if(player.x > lvlSizeX + 40){
        player.health--; 
    }
    if(player.y < (0 - 200)){
        player.health--;
    }
    if(player.x < (0 - 40)){
        player.health--;
    }
    
    if (player.health <= 0) {
        timer++;
        
        if(timer > 25){
            
            player.acceleration = 600;
            player.gravity = 600;
            
            mapSetup(currentLevel - 1);
            timer = 0;
        }
        else {
            
            player.v.x = 0;
            player.v.y = 0;
            player.acceleration = 0;
            player.gravity = 0;
        }
    }
    if (nxt) {
        mapSetup(currentLevel);
        currentLevel++;
        player.health = 10;
        nxt = false;
        localStorage.setItem("storedLevel", currentLevel);
    }
}

/* main render loop */
const render = (timestamp) => {
    
    //prefer the rAF timestamp when present
    const now = (typeof timestamp === 'number') ? timestamp : performance.now();
    
    //dt in milliseconds, never negative
    dtMs = Math.max(0, now - lastTime);
    lastTime = now;
    
    //dt in seconds (clamped to avoid huge jumps after tab hidden)
    dt = (Math.min(dtMs / 1000, 0.1));
    fps = dtMs > 0 ? Math.round(1000 / dtMs) : fps;
    
    //advance the water ripple animation clock
    frameTime = now;
    
    drawBackgroundArt();
    
    //ctx.fillRect(0, 0, lvlSizeX, lvlSizeY);
    
    
    //ctx.fillStyle = 'rgb(25, 35, 35)';
    //ctx.fillRect(0, 0, lvlSizeX/2, lvlSizeY);
    
    app();
    graphics.ctx.save();
    
    player.inWater = false;
    const playerCenterX = player.x + player.w / 2;
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.type !== "water" || !Funcs.edgeCheck(player, block)) continue;
        if (block.isTopSurface && block.isTopSurface()) {
            const surfaceLine = waterSurfaceLineAt(playerCenterX);
            if (surfaceLine !== null && player.y + player.h < surfaceLine) {
                continue;
            }
        }
        player.inWater = true;
        break;
    }

    updateWaterSurfaceSegments(dt);
    updateWaterLightDisturbances(dt);
    updatePlayerWaterSpring(dt);

    player.moveX();
    
    for(let i in blocks){
        const block = blocks[i];
        if (block.type === "water") continue;
        let col = player.collideX(block);
        //only collide with one block a frame
        if(col){
            break;
        }
    }
    
    
    //vertical collisions and player movement
    player.moveY();
    
    for(let i in blocks){
        const block = blocks[i];
        if (block.type === "water") continue;
        let col = player.collideY(block);
        //only collide with one block a frame
        if(col){
            break;
        }
    }
    

            
    //cam shake loop
    for(let s in shakes){
        shakes[s].active(s);
    }

    cam.update();
    updateRainLayers(dt);
    drawRainLayer("back");

    for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type !== "water" && blocks[i].type !== "fire") {
            blocks[i].draw();
        }
    }

    // Draw fabric
    // Uncomment these if you want it active
    scarf.update()
    rasterizer.raster();

    player.display();
    drawRainLayer("mid");

    //Draw water on top of the player so it looks like they are submerged.
    for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type === "water") {
            blocks[i].draw();
        }
    }

    applyUnderwaterDistortion();

    updateAndRenderLighting(lighting);
    drawRainLayer("front");

    for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type === "fire") {
            blocks[i].update(texture);
            blocks[i].draw();
        }
    }

    if(currentLevel === MAP.length){
        shakes.push(new Shake(100));
        document.getElementById("game").style.display = "none";
        const sax = document.getElementById("img").style;
        sax.display = "block";
        sax.top = '40px';
        sax.left = `${250 + shake.x}px`;
        sax.transform = `rotate(${shake.x}deg)`;
        sax.width = "40%";
        
    }
    
    // graphics.ctx.strokeStyle = "red";
    // graphics.ctx.strokeRect(0, 0, lvlSizeX, lvlSizeY);
    
    

    
    
    graphics.ctx.restore();
    
    if(player.health < 0 && timer < 25){
        graphics.ctx.fillStyle = "rgba(55, 56, 55, 0.1)";
        let t = 0;
        t = Funcs.lerp(t, timer * 3, 0.8);
        graphics.ctx.strokeStyle = "white";
        graphics.ctx.save();
            let x = 0 + t;
            let y = 0 + t;
            //ctx.translate(x / 2, y / 2);
            graphics.ctx.strokeRect(x,y, 600 - t - t, 600 - t - t);
            graphics.ctx.fillRect(x, y, 600 - t - t, 600 - t - t)
        graphics.ctx.restore();
        
    }
    
    if(!freeze){
        //window.requestAnimationFrame(loop);
    }
};

/* Initialize first map and start loop */
mapSetup(currentLevel);

let rafId = null;
let running = true;

//pause when tab hidden to avoid wasted frames
document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running && rafId === null) {
        rafId = requestAnimationFrame(loop);
    }
    if (!running && rafId !== null) { 
        cancelAnimationFrame(rafId); 
        rafId = null; 
    }
});

function loop(now) {
    //if(!debug.freeze){
        if (!running) { 
            rafId = null; return; 
        }
        render(now);
        rafId = requestAnimationFrame(loop);
    //}
    //console.info(debug.freeze);
}

// start
if (rafId) cancelAnimationFrame(rafId);
rafId = requestAnimationFrame(loop);



