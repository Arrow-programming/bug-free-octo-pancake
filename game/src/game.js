import { gfx } from '../assets/art/pixelart.js';
import { graphics } from './graphics.js';
import * as Water from './environment/water.js';
import { LEVEL_RAIN_INTENSITIES, LevelHandler } from './levels.js';
import { Player } from './player/player.js';
import { Camera } from './systems/camera.js';
import { Rain } from './environment/rain.js';
import { setWaterContext, setWaterFrameTime } from './environment/water.js';
import { NPCSystem } from './objects/npcs.js';
import { Funcs } from './utils/funcs.js';
import { input, mouse } from './utils/input.js';
import { Hitbox } from './utils/hitbox.js';
import { Debug } from './utils/debug.js';
import { ready, BlockTypes } from './objects/typedecls.js';
import { SLIP_SCALE } from './utils/constants.js';
import { Bounds } from './utils/dataStructures.js';

export class Game {
	constructor(canvasId = 'game') {
		graphics.init(canvasId);
		this.level = 0;
		this.timer = 0;
		this.lastTime = performance.now();
		this.player = new Player({
			water: Water,
			onPortal: () => {},
			onImpact: power => this.camera?.addShake(power),
		});
		setWaterContext(this.player);
		this.npcSystem = new NPCSystem();
		this.camera = new Camera(this.player);
		this.levels = new LevelHandler({
			player: this.player,
			camera: this.camera,
			npcs: this.npcSystem,
			onResetRain: level => {
				this.rain?.setIntensity(LEVEL_RAIN_INTENSITIES[level]);
				this.rain?.reset();
			},
		});
		this.rain = new Rain({ player: this.player, levels: this.levels, camera: this.camera, intensity: 'medium' });
		

		this.debugLighting = true;
		this.debug = new Debug(this);
		this.running = false;
		this.resize = () => graphics.resize();
		window.addEventListener('resize', this.resize);

		this.buffer1 = { slip: 0, slipvel: 0 };
	}

	async start() {
		await ready();
		await this.levels.load();
		this.levels.setup();
		this.running = true;
		document.addEventListener('visibilitychange', () => {
			this.running = !document.hidden;
			if (this.running) {
				requestAnimationFrame(this.loop);
			}
		});
		requestAnimationFrame(this.loop);
	}

	loop = now => {
		if (!this.running) {
			return;
		}
		const dt = Math.min(Math.max(0, now - this.lastTime) / 1000, 0.1);
		const fps = Math.floor(1 / dt);
		this.lastTime = now;
		setWaterFrameTime(now);
		this.debug.update(dt);
		if (!this.debug.freeze) this.update(dt);
		this.draw(dt);
		requestAnimationFrame(this.loop);
	};

	update(dt) {
		const { player, levels } = this;
		levels.updateStreaming();
		if (player.health <= 0) {
			this.timer++;
			player.xv = 0;
			player.yv = 0;
			if (this.timer > 25) {
				this.timer = 0;
				player.acceleration = 1600;
				player.gravity = 600;
				levels.setup();
				this.camera.resetPan();
				player.health = 10;
			} else {
				player.acceleration = 0;
				player.gravity = 0;
			}
		}
		player.inWater = levels.blocks.some(block => block.type === BlockTypes.water && Hitbox.staticCollision(player.hbox, block.hbox));
		
		Water.updateWaterSurfaceSegments(dt);
		Water.updateWaterLightDisturbances(dt);
		Water.updatePlayerWaterSpring(dt);

		player.moveX(dt);
		player.moveY(dt);

		player.collide(levels.blocks, this.buffer1);
		const { slip, slipvel } = this.buffer1;

		player.xv = (player.xv - slipvel) * (slip ** (dt * SLIP_SCALE)) + slipvel;
    	player.pastSlip = slip;

		this.npcSystem.update(levels.blocks, dt)

		this.rain.update(dt);

		input.update();
		mouse.update();
	}

	draw(dt) {
		const { ctx } = graphics;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#111827';
		ctx.fillRect(0, 0, graphics.width, graphics.height);

		
		graphics.pixCtx.clearRect(0, 0, graphics.pixCanvas.width, graphics.pixCanvas.height);
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
			if (block.type !== BlockTypes.water && block.type !== BlockTypes.fire) {
				block.draw();
			}
		}
		this.player.draw(dt);
		this.rain.drawLayer(BlockTypes.mid);
		for (const block of this.levels.blocks) {
			if (block.type === BlockTypes.water) {
				block.draw(this.levels.blocks);
			}
		}
		this.drawLighting();
		this.rain.drawLayer('front');
		for (const block of this.levels.blocks) {
			if (block.type === BlockTypes.fire) {
				block.update(dt);
				block.draw();
			}
		}

		this.npcSystem.draw();

		graphics.render();
		ctx.restore();
	}

	drawLighting() {
		const { lighting, grid } = this.levels;
		if (!lighting || !this.debugLighting) {
			return;
		}
		const viewWidth = graphics.width / this.camera.z;
		const viewHeight = graphics.height / this.camera.z;
		const viewBounds = new Bounds(this.player.x - viewWidth / 2 - 2 * grid.size, this.player.y - viewHeight / 2 - 2 * grid.size, viewWidth + 4 * grid.size, viewHeight + 4 * grid.size);
		graphics.ctx.fillStyle = "#000";
		for (const { x, y } of grid.visitCells(viewBounds)) {
			graphics.ctx.globalAlpha = 1 - lighting.getLightLevel(x, y, this.player, this.levels);
			graphics.ctx.fillRect(grid.cellToWorld(x), grid.cellToWorld(y), grid.size, grid.size);
		}
	}
}
