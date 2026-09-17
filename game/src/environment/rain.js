import { PIXEL_SIZE } from '../utils/constants.js';
import { Funcs } from '../utils/funcs.js';
import { graphics } from '../graphics.js';
import * as Water from './water.js';
import { Player } from '../player/player.js';

const SOLID_TYPES = new Set([
	'block',
	'hazard',
	'portal',
	'tramp',
	'mud',
	'ice',
]);

const INTENSITY_PRESETS = Object.freeze({
	low: { densityScale: 0.35, maxDrops: 800 },
	medium: { densityScale: 1, maxDrops: 1600 },
	high: { densityScale: 2, maxDrops: 2400 },
});

export class Rain {
	constructor({ player, levels, camera, intensity = 'medium' }) {
		this.player = player;
		this.levels = levels;
		this.camera = camera;
		this.config = {
			enabled: true,
			angleDeg: 20,
			speed: 820,
			speedVariance: 0.35,
			maxDropsPerLayer: 1600,
			splashColor: '#eaf8ff',
			layers: {
				back: {
					collide: false,
					parallax: 0.55,
					speedScale: 0.8,
					baseDensity: 40,
					pixelSize: PIXEL_SIZE,
					dropLength: 6,
					alphaScale: 0.7,
					color: '#3f5c78',
				},
				mid: {
					collide: true,
					parallax: 1,
					speedScale: 1,
					baseDensity: 20,
					pixelSize: PIXEL_SIZE,
					dropLength: 8,
					alphaScale: 1,
					color: '#bcdcff',
				},
				front: {
					collide: false,
					parallax: 1.45,
					speedScale: 1.25,
					baseDensity: 4,
					pixelSize: PIXEL_SIZE * 1.2,
					dropLength: 10,
					alphaScale: 1,
					color: '#eaf6ff',
				},
			},
		};
		this.setIntensity(intensity);
		this.reset();
		window.RAIN = this.config;
	}

	setIntensity(intensity = 'medium') {
		const preset = INTENSITY_PRESETS[intensity] ?? INTENSITY_PRESETS.medium;
		this.config.intensity = INTENSITY_PRESETS[intensity] ? intensity : 'medium';
		this.config.maxDropsPerLayer = preset.maxDrops;
		for (const layer of Object.values(this.config.layers)) {
			layer.density = layer.baseDensity * preset.densityScale;
		}
	}

	reset() {
		this.layers = {};
		for (const key of Object.keys(this.config.layers)) {
			this.layers[key] = { drops: [], spawnAccumulator: 0 };
		}
		this.splashes = [];
	}

	spawnSplash(x, y) {
		const count = 3 + Math.floor(Math.random() * 3);
		for (let i = 0; i < count; i++) {
			this.splashes.push({
				x: x + Math.round((Math.random() - 0.5) * 3) * PIXEL_SIZE,
				y: y + Math.round((Math.random() - 0.5) * 2) * PIXEL_SIZE,
				life: 0,
				maxLife: 0.12 + Math.random() * 0.1,
			});
		}
	}

	update(dt) {
		const angle = this.config.angleDeg * Math.PI / 180;
		for (const [key, layer] of Object.entries(this.config.layers)) {
			const state = this.layers[key];
			if (!this.config.enabled) {
				state.drops.length = 0;
				continue;
			}
			const centerX = this.camera.x * layer.parallax;
			const centerY = this.camera.y * layer.parallax;
			const spawnY = centerY - graphics.height / 2 - 160;
			const slant = Math.abs(Math.tan(angle)) * (graphics.height + 160);
			const left = centerX - graphics.width / 2 - slant - 80;
			const width = graphics.width + 2 * slant + 160;
			state.spawnAccumulator += layer.density * width / 1000 * dt;
			while (state.spawnAccumulator >= 1 && state.drops.length < this.config.maxDropsPerLayer) {
				state.spawnAccumulator--;
				state.drops.push(this.drop(left + Math.random() * width, spawnY - Math.random() * 260, layer));
			}
		}
		for (const state of Object.values(this.layers)) {
			for (let i = state.drops.length - 1; i >= 0; i--) {
				state.drops[i].update(dt);
				if (!state.drops[i].alive) state.drops.splice(i, 1);
			}
		}
		for (let i = this.splashes.length - 1; i >= 0; i--) {
			this.splashes[i].life += dt;
			if (this.splashes[i].life >= this.splashes[i].maxLife) this.splashes.splice(i, 1);
		}
	}

	drop(x, y, layer) {
		const rain = this;
		const angle = this.config.angleDeg * Math.PI / 180;
		return {
			x, y, alive: true,
			vx: Math.sin(angle) * this.config.speed * layer.speedScale,
			vy: Math.cos(angle) * this.config.speed * layer.speedScale,
			layer,
			update(dt) {
				const nx = this.x + this.vx * dt;
				const ny = this.y + this.vy * dt;
				if (this.layer.collide) {
					const player = rain.player;
					if (nx >= player.x && nx <= player.x + Player.w && ny >= player.y && ny <= player.y + Player.h) {
						this.alive = false;
						rain.spawnSplash(nx, ny);
						return;
					}
					const block = rain.levels.blockAt(nx, ny);
					if (block && (block.type === 'water' || SOLID_TYPES.has(block.type))) {
						this.alive = false;
						if (block.type === 'water') Water.splashWaterSurface(nx, 12);
						rain.spawnSplash(nx, Math.min(ny, block.y));
						return;
					}
				}
				this.x = nx;
				this.y = ny;
				if (this.y > rain.levels.height + 900 || this.x < -1200 || this.x > rain.levels.width + 1200) this.alive = false;
			},
			draw() {
				const length = this.layer.dropLength ?? 4;
				const norm = Math.hypot(this.vx, this.vy) || 1;
				graphics.ctx.fillStyle = this.layer.color;
				for (let i = 0; i < length; i++) {
					const leadingToTrailing = length <= 1 ? 0 : i / (length - 1);
					graphics.ctx.globalAlpha = this.layer.alphaScale * (1 - leadingToTrailing * 0.6);
					const x = Math.round((this.x - this.vx / norm * i * PIXEL_SIZE + rain.camera.x * (1 - this.layer.parallax)) / PIXEL_SIZE) * PIXEL_SIZE;
					const y = Math.round((this.y - this.vy / norm * i * PIXEL_SIZE + rain.camera.y * (1 - this.layer.parallax)) / PIXEL_SIZE) * PIXEL_SIZE;
					graphics.ctx.fillRect(x, y, this.layer.pixelSize, this.layer.pixelSize);
				}
			},
		};
	}

	drawLayer(key) {
		const state = this.layers[key];
		if (!state) return;
		graphics.ctx.save();
		graphics.ctx.imageSmoothingEnabled = false;
		for (const drop of state.drops) drop.draw();
		if (key === 'mid') {
			for (const splash of this.splashes) {
				graphics.ctx.globalAlpha = Funcs.constrain(1 - splash.life / splash.maxLife, 0, 1);
				graphics.ctx.fillStyle = this.config.splashColor;
				graphics.ctx.fillRect(splash.x, splash.y, PIXEL_SIZE, PIXEL_SIZE);
			}
		}
		graphics.ctx.globalAlpha = 1;
		graphics.ctx.restore();
	}
}
