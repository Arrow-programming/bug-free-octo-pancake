/**
 * Water generation and display
 */


import { BLOCK_SIZE, PIXEL_SIZE, WATER_SPRING, WATER_WAVE, WATER_LIGHT_BEND, BG_RIPPLE } from '../utils/constants.js';
import { Funcs } from '../utils/funcs.js';
import { graphics } from '../graphics.js';
import { Player } from '../player/player.js';
import { LcMath } from '../utils/lcMath.js';

let player = null;
let frameTime = 0;

export function setWaterContext(nextPlayer) {
	player = nextPlayer;
}

export function setWaterFrameTime(time) {
	frameTime = time;
}

/*
	WATER SYSTEM
*/

//maps a water tile's world x (column) to the world y of that column's surface the topmost water tile above it
export let waterSurfaceByColumn = {};

//palette
const waterPalette = {
	surface: "#467ed3de",
	body: "#1f52b1",
};





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
		
		this._cacheSway = 0;
		this._cacheInvalidatorDepth = NaN;
	}

	centerAt(depth, t, surfaceDepth = this.anchorDepth) {
		const anchorFactor = Funcs.constrain(surfaceDepth / this.anchorDepth, 0, 1);
		let sway;
		if (this._cacheInvalidatorDepth != depth) {
			sway = LcMath.sin(depth * this.swayFreq + t * this.swaySpeed + this.swayPhase) * this.swayAmp;
			this._cacheSway = sway;
			this._cacheInvalidatorDepth = depth;
		} else {
			sway = this._cacheSway;
		}
		return (this.x
			+ depth * this.tilt
			+ sway * anchorFactor);
	}

	covers(worldX, depth, t, surfaceDepth) {
		return Math.abs(worldX - this.centerAt(depth, t, surfaceDepth)) < this.width / 2;
	}
}
export function createLightStreaks(spanWidth, opts) {
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
export let lightStreaksWide = [];
export let lightStreaksFine = [];

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
		this._angle = options.angle ?? 0;
		this.sway = options.sway ?? 0.2;
		this.penetrationLength = options.penetrationLength ?? 180;

		// Caches
		this._cacheCosAngle = Math.cos(this._angle);
		this._cacheSinAngle = Math.sin(this._angle);
	}

	get angle() {
		return this._angle;
	}

	set angle(value) {
		this._angle = value;
		this._cacheCosAngle = Math.cos(value);
		this._cacheSinAngle = Math.sin(value);
	}

	noise(x, y) {
		const value = Math.sin(x * 12.9898 + y * 78.233 + this.seed * 37.719) * 43758.5453123;
		return value - Math.floor(value);
	}

	intensityAt(px, py, t) {
		const travel = (t * this.speed + this.phase) * this.direction;
		const dx = px - (this.x + travel * 0.65);
		const dy = py - (this.y + Math.sin(dx * 0.018 + this.phase) * this.thickness * 0.12 + Math.cos(t * 0.0006 + this.seed * 0.002) * 8);
		const along = dx * this._cacheCosAngle + dy * this._cacheSinAngle;
		const across = -dx * this._cacheSinAngle + dy * this._cacheCosAngle;
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

const waterLightBendBuffer = { bend: 0, glow: 0 };
const waterLightBendNull = { bend: 0, glow: 0 };

//water tile rendering
export function drawWaterTile(x, y, w, h, topSurface, buffer1) {
	const cols = 9;
	const rows = 9;
	const cellW = Math.max(1, Math.floor(w / cols));
	const cellH = Math.max(1, Math.floor(h / rows));
	const t = frameTime / 1000;
	const baseRow = Math.floor(y / cellH);

	graphics.ctx.save();
	graphics.ctx.imageSmoothingEnabled = false;

	buffer1.length = 0;
	const surfaceRowStarts = buffer1;
	if (topSurface) {
		for (let col = 0; col < cols; col++) {
			const cellCenterX = x + col * cellW + cellW / 2;
			const displacement = waterDisplacementAt(cellCenterX);
			surfaceRowStarts.push(2 + Math.round(displacement / cellH));
		}
	}

	const minRow = topSurface ? Math.min(0, ...surfaceRowStarts) : 0;
	
	graphics.ctx.globalCompositeOperation = "lighter";
	for (let row = minRow; row < rows; row++) {
		const gy = baseRow + row;
		const px0 = x, py = y + row * cellH;

		for (let col = 0; col < cols; col++) {
			const px = px0 + col * cellW;
			
			if (topSurface && row < surfaceRowStarts[col]) {
				continue;
			}

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
			const cellCenterX = px + cellW / 2;
			const cellCenterY = py + cellH / 2;
			const disturbance = waterLightDisturbances.length ?
				waterLightBendAt(cellCenterX, cellCenterY, waterLightBendBuffer) :
				waterLightBendNull;
			const sampleX = cellCenterX + disturbance.bend;
			
			let wide = null;
			for (let i = 0; i < lightStreaksWide.length; ++i) {
				const s = lightStreaksWide[i];
				if (s.covers(sampleX, gy, t, depth)) {
					wide = s;
					break;
				}
			}

			if (wide) {
				graphics.ctx.globalAlpha = Funcs.constrain((wide.opacity + disturbance.glow * 0.6) * depthFade, 0, 1);
				graphics.ctx.fillStyle = wide.color;
				graphics.ctx.fillRect(px, py, cellW, cellH);
			}
			
			let fine = null;
			for (let i = 0; i < lightStreaksFine.length; ++i) {
				const s = lightStreaksFine[i];
				if (s.covers(sampleX, gy, t, depth)) {
					fine = s;
					break;
				}
			}
			if (fine) {
				graphics.ctx.globalAlpha = Funcs.constrain((fine.opacity + disturbance.glow * 0.4) * depthFade, 0, 1);
				graphics.ctx.fillStyle = fine.color;
				graphics.ctx.fillRect(px, py, cellW, cellH);
			}
		}
	}

	// Separate phases because switching globalCompositeOperation is apparently overhead.

	/*
	graphics.ctx.globalCompositeOperation = "source-over";
	for (let row = minRow; row < rows; row++) {
		const gy = baseRow + row;
		const px0 = x, py = y + row * cellH;

		for (let col = 0; col < cols; col++) {
			const px = px0 + col * cellW;
			
			for (const ripple of waterRipples) {
				ripple.drawOverTile(graphics.ctx, px, py, cellW, cellH, t);
			}
		}
	}
	*/
	graphics.ctx.restore();
}



//surface spring simulation

class WaterSurfaceSegment {
	constructor(startX, endX, surfaceY) {
		this.startX = startX;
		this.endX = endX;
		this.surfaceY = surfaceY;
		this.spacing = WATER_SPRING.spacing;
		this.count = Math.max(2, Math.round((endX - startX) / this.spacing) + 1);
		this.heights = new Float32Array(this.count);
		this.velocities = new Float32Array(this.count);

		this.leftDeltas = new Float32Array(this.count);
		this.rightDeltas = new Float32Array(this.count);
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
		const leftDeltas = this.leftDeltas;
		const rightDeltas = this.rightDeltas;
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
				if (i > 0) {
					this.heights[i - 1] += leftDeltas[i] * steps;
				}
				if (i < this.count - 1) {
					this.heights[i + 1] += rightDeltas[i] * steps;
				}
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

export function buildWaterSurfaceSegments() {
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

export function updateWaterSurfaceSegments(dt) {
	for (const segment of waterSurfaceSegments) {
		segment.update(dt);
	}
}

export function splashWaterSurface(worldX, velocity) {
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
	return LcMath.sin(worldX * WATER_SPRING.idleFreq + t * WATER_SPRING.idleSpeed) * WATER_SPRING.idleAmplitude
		 + LcMath.sin(worldX * WATER_SPRING.idleFreq * 2.3 - t * WATER_SPRING.idleSpeed * 0.7) * WATER_SPRING.idleAmplitude * 0.4;
}

function waterDisplacementAt(worldX) {
	const segment = findWaterSegment(worldX);
	const spring = segment ? segment.heightAt(worldX) : 0;
	const total = spring + waterIdleWave(worldX, frameTime / 1000);
	return Funcs.constrain(total, -WATER_SPRING.maxDisplacement, WATER_SPRING.maxDisplacement);
}

export function waterSurfaceLineAt(worldX) {
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

	sample(worldX, worldY, outObject) {
		const depth = worldY - this.restY;
		if (depth < 0) {
			outObject.bend = 0;
			outObject.glow = 0;
			return outObject;
		}
		const lateral = worldX - this.x;
		const radial = Math.exp(-(lateral * lateral) / (2 * WATER_LIGHT_BEND.radius * WATER_LIGHT_BEND.radius));
		if (radial < 0.015) {
			outObject.bend = 0;
			outObject.glow = 0;
			return outObject;
		}
		const front = this.age * WATER_LIGHT_BEND.travelSpeed;
		const wavefrontDist = depth - front;
		const envelope = Math.exp(-(wavefrontDist * wavefrontDist) / (2 * WATER_LIGHT_BEND.frontWidth * WATER_LIGHT_BEND.frontWidth));
		const settle = Math.exp(-this.age * WATER_LIGHT_BEND.decayRate);
		const magnitude = this.strength * radial * envelope * settle;
		const ripple = LcMath.sin(wavefrontDist * WATER_LIGHT_BEND.freq - this.age * WATER_LIGHT_BEND.oscSpeed);
		outObject.bend = magnitude * ripple;
		outObject.glow = magnitude * Math.max(0, ripple);
		return outObject;
	}
}

export let waterLightDisturbances = [];

export function spawnWaterLightDisturbance(worldX, strength) {
	const segment = findWaterSegment(worldX);
	if (!segment || strength <= 0) {
		return;
	}
	waterLightDisturbances.push(new WaterLightDisturbance(worldX, segment.surfaceY, strength));
	if (waterLightDisturbances.length > WATER_LIGHT_BEND.maxActive) {
		waterLightDisturbances.shift();
	}
}

const uwldPredicate = (disturbance) => !disturbance.isDone();
export function updateWaterLightDisturbances(dt) {
	for (const disturbance of waterLightDisturbances) {
		disturbance.update(dt);
	}
	waterLightDisturbances.filterInPlace(uwldPredicate);
}

const buffer = { bend: 0, glow: 0 };
function waterLightBendAt(worldX, worldY, outObject) {
	let bend = 0;
	let glow = 0;
	for (const disturbance of waterLightDisturbances) {
		const sample = disturbance.sample(worldX, worldY, buffer);
		bend += sample.bend;
		glow += sample.glow;
	}
	outObject.bend = bend;
	outObject.glow = glow;
	return outObject;
}



export function backgroundRippleBendAt(worldX, worldY) {
	if (!waterLightDisturbances.length) {
		return 0;
	}
	let bend = 0;
	for (const disturbance of waterLightDisturbances) {
		const lateral = worldX - disturbance.x;
		const vertical = worldY - disturbance.restY;
		const dist = Math.sqrt(lateral * lateral + vertical * vertical);
		const radial = Math.exp(-(dist * dist) / (2 * BG_RIPPLE.radius * BG_RIPPLE.radius));
		if (radial < 0.02) {
			continue;
		}
		const front = disturbance.age * BG_RIPPLE.travelSpeed;
		const wavefrontDist = dist - front;
		const envelope = Math.exp(-(wavefrontDist * wavefrontDist) / (2 * BG_RIPPLE.frontWidth * BG_RIPPLE.frontWidth));
		const settle = Math.exp(-disturbance.age * BG_RIPPLE.decayRate);
		const magnitude = (disturbance.strength / 60) * radial * envelope * settle;
		const ripple = LcMath.sin(wavefrontDist * BG_RIPPLE.freq - disturbance.age * BG_RIPPLE.oscSpeed);
		bend += magnitude * ripple;
	}
	return Funcs.constrain(bend, -1, 1) * BG_RIPPLE.amp;
}

//player an' water interaction 
export function updatePlayerWaterSpring(dt) {
	if (!player) {
		return;
	}
	const centerX = player.x + Player.w / 2;
	const segment = findWaterSegment(centerX);
	if (!segment) {
		player.wasInWater = player.inWater;
		return;
	}
	if (player.inWater && !player.wasInWater) {
		const impactSpeed = Math.max(player.yv, WATER_SPRING.entryMinImpact) * WATER_SPRING.entrySplashScale;
		splashWaterSurface(centerX, impactSpeed);
		spawnWaterLightDisturbance(centerX, Funcs.constrain(impactSpeed * 0.5, 10, 60));
		if (player.yv > 0) {
			player.yv *= WATER_SPRING.entryDamping;
		}
	} else if (!player.inWater && player.wasInWater) {
		const exitSpeed = Math.min(player.yv, -30);
		splashWaterSurface(centerX, exitSpeed);
		spawnWaterLightDisturbance(centerX, Funcs.constrain(Math.abs(exitSpeed) * 0.35, 12, 60));
	}
	if (player.inWater) {
		const depthUnderRest = (player.y + Player.h) - segment.surfaceY;
		if (depthUnderRest > -WATER_SPRING.pressBand && depthUnderRest < WATER_SPRING.pressBand) {
			const target = Funcs.constrain(depthUnderRest * 0.18, -WATER_SPRING.maxDisplacement, WATER_SPRING.maxDisplacement);
			pressWaterSurface(centerX, target, WATER_SPRING.weightPush, dt);
		}
	}
	player.wasInWater = player.inWater;
}



