import { gfx } from '../assets/art/pixelart.js';
import { graphics } from './graphics.js';
import * as Water from './environment/water.js';
import { LEVEL_RAIN_INTENSITIES, LevelHandler } from './levels.js';
import { Player } from './player/player.js';
import { Camera } from './systems/camera.js';
import { Rain } from './environment/rain.js';
import { setWaterContext, setWaterFrameTime } from './environment/water.js';
import { Funcs } from './utils/funcs.js';
import { texStr } from '../assets/noise.js';
import { input, mouse } from './utils/input.js';

export class Game {
	constructor(canvasId = 'game') {
		graphics.init(canvasId);
		this.level = 0;
		this.nextLevel = true;
		this.timer = 0;
		this.lastTime = performance.now();
		this.player = new Player({
			water: Water,
			onPortal: () => {
				this.nextLevel = true;
			},
			onImpact: power => this.camera?.addShake(power),
		});
		setWaterContext(this.player);
		this.camera = new Camera(this.player);
		this.levels = new LevelHandler({
			player: this.player,
			camera: this.camera,
			onResetRain: level => {
				this.rain?.setIntensity(LEVEL_RAIN_INTENSITIES[level]);
				this.rain?.reset();
			},
		});
		this.rain = new Rain({ player: this.player, levels: this.levels, camera: this.camera, intensity: 'medium' });
		this.fireTexture = null;
		this.running = false;
	}

	async start() {
		this.fireTexture = await this.loadFireTexture();
		this.levels.setup(0);
		this.running = true;
		document.addEventListener('visibilitychange', () => {
			this.running = !document.hidden;
			if (this.running) {
				requestAnimationFrame(this.loop);
			}
		});
		requestAnimationFrame(this.loop);
	}

	async loadFireTexture() {
		const canvas = document.createElement('canvas');
		canvas.width = 600;
		canvas.height = 600;
		const context = canvas.getContext('2d');
		const image = new Image();
		image.src = `data:image/png;base64,${texStr.img}`;
		try {
			await new Promise((resolve, reject) => {
				image.onload = resolve;
				image.onerror = reject;
			});
			context.drawImage(image, 0, 0, 600, 600);
		} catch {
			const imageData = context.createImageData(600, 600);
			for (let i = 0; i < imageData.data.length; i += 4) {
				const value = Math.floor(Math.random() * 255);
				imageData.data[i] = value;
				imageData.data[i + 1] = value;
				imageData.data[i + 2] = value;
				imageData.data[i + 3] = 255;
			}
			context.putImageData(imageData, 0, 0);
		}
		return context.getImageData(0, 0, 600, 600);
	}

	loop = now => {
		if (!this.running) {
			return;
		}
		const dt = Math.min(Math.max(0, now - this.lastTime) / 1000, 0.1);
		this.lastTime = now;
		setWaterFrameTime(now);
		this.update(dt);
		this.draw(dt);
		requestAnimationFrame(this.loop);
	};

	update(dt) {
		const { player, levels } = this;
		if (player.y > levels.height + 40 || player.x > levels.width + 40 || player.y < -200 || player.x < -40) {
			player.health--;
		}
		if (this.nextLevel) {
			levels.setup(this.level);
			this.level++;
			player.health = 10;
			this.nextLevel = false;
			localStorage.setItem('storedLevel', this.level);
		}
		if (player.health <= 0) {
			this.timer++;
			player.v.x = 0;
			player.v.y = 0;
			if (this.timer > 25) {
				this.timer = 0;
				player.acceleration = 1600;
				player.gravity = 600;
				levels.setup(Math.max(0, this.level - 1));
				player.health = 10;
			} else {
				player.acceleration = 0;
				player.gravity = 0;
			}
		}
		player.inWater = levels.blocks.some(block => block.type === 'water' && Funcs.edgeCheck(player, block));
		Water.updateWaterSurfaceSegments(dt);
		Water.updateWaterLightDisturbances(dt);
		Water.updatePlayerWaterSpring(dt);
		player.moveX(dt);
		for (const block of levels.blocks) {
			if (block.type !== 'water' && player.collideX(block)) {
				break;
			}
		}
		player.moveY(dt);
		for (const block of levels.blocks) {
			if (block.type !== 'water' && player.collideY(block)) {
				break;
			}
		}
		this.rain.update(dt);

		input.update();
		mouse.update();
	}

	draw(dt) {
		const { ctx } = graphics;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#111827';
		ctx.fillRect(0, 0, graphics.width, graphics.height);
		const backdrop = gfx?.props?.backdrops?.dungeon;
		if (backdrop) {
			const size = 5;
			const w = backdrop.w * size;
			const h = backdrop.h * size;
			const offset = ((Math.floor(-this.camera.x * 0.08) % w) + w) % w;
			for (let x = -w; x < graphics.width + w; x += w) {
				for (let y = 0; y < graphics.height + h; y += h) {
					backdrop.draw(ctx, x + offset, y, size);
				}
			}
		}
		ctx.save();
		this.camera.update();
		this.rain.drawLayer('back');
		for (const block of this.levels.blocks) {
			if (block.type !== 'water' && block.type !== 'fire') {
				block.draw();
			}
		}
		this.player.draw(dt);
		this.rain.drawLayer('mid');
		for (const block of this.levels.blocks) {
			if (block.type === 'water') {
				block.draw(this.levels.blocks);
			}
		}
		this.drawLighting();
		this.rain.drawLayer('front');
		for (const block of this.levels.blocks) {
			if (block.type === 'fire') {
				block.update(this.fireTexture);
				block.draw();
			}
		}
		ctx.restore();
	}

	drawLighting() {
		const { lighting, grid, levelArray } = this.levels;
		if (!lighting) {
			return;
		}
		for (const { x, y } of grid.visitCells(this.levels.cameraBounds)) {
			const symbol = levelArray.get(x, y);
			graphics.ctx.fillStyle = `rgba(0, 0, 0, ${1 - lighting.getLightLevel(x, y, symbol, this.player, levelArray)})`;
			graphics.ctx.fillRect(grid.cellToWorld(x), grid.cellToWorld(y), grid.size, grid.size);
		}
	}
}
