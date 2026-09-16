import { BLOCK_SIZE, PIXEL_SIZE, WATER_SPRING } from '../utils/constants.js';
import { Funcs } from '../utils/funcs.js';
import { input } from '../utils/input.js';
import { gfx } from '../../assets/art/pixelart.js';
import { graphics } from '../graphics.js';
import { Animator } from '../sprites.js';

export class Player {
	constructor({ water, onPortal, onImpact } = {}) {
		this.water = water;
		this.onPortal = onPortal ?? (() => {});
		this.onImpact = onImpact ?? (() => {});
		this.animator = new Animator('player')
		this.reset();
	}

	reset(x = 300, y = 300) {
		Object.assign(this, { x, y, w: BLOCK_SIZE - 5, h: 65, health: 10,
			acceleration: 1600, friction: 1.1, jumpPow: 420, gravity: 600, speed: 200,
			dir: 1, animState: 'idle', animFrame: 0, animTimer: 0, inWater: false, wasInWater: false,
			action: 'idle', v: { x: 0, y: 0 },
			collide: { left: false, right: false, top: false, bottom: false },
			inputs: { left: false, right: false, up: false, down: false } });
	}

	collideX(block) {
		if (!Funcs.edgeCheck(this, block)) {
			this.collide.left = this.collide.right = false;
			block.colX = false;
			return false;
		}
		if (block.type === 'hazard') {
			this.health -= 10;
		} else if (block.type === 'portal') {
			this.onPortal();
		} else if (this.v.x > 0) {
			this.collide.right = true;
			this.x = block.x - this.w;
		} else {
			this.collide.left = true;
			this.x = block.x + block.w;
		}
		block.colX = true;
		return true;
	}

	collideY(block) {
		if (!Funcs.edgeCheck(this, block)) {
			this.collide.top = this.collide.bottom = false;
			block.colY = false;
			return false;
		}
		if (block.type === 'hazard') {
			this.health -= 10;
		} else if (block.type === 'portal') {
			this.onPortal();
		} else if (this.v.y > 0) {
			this.onImpact(this.v.y / 60);
			this.collide.top = true;
			this.y = block.y - this.h;
			this.v.y = 0;
		} else {
			this.collide.bottom = true;
			this.y = block.y + block.h;
			this.v.y *= -0.1;
		}
		block.colY = true;
		return true;
	}

	moveX(dt) {
		this.inputs.left = input.press('Left');
		this.inputs.right = input.press('Right');
		if (this.inWater) {
			const surface = this.water.waterSurfaceLineAt(this.x + this.w / 2);
			const depth = surface === null ? 999 : surface - this.y;
			const atSurface = depth > 0 && depth < WATER_SPRING.skimBand;
			const accel = atSurface ? WATER_SPRING.skimAccelMul : 0.35;
			const speed = atSurface ? WATER_SPRING.skimSpeedMul : 0.7;
			if (this.inputs.left) {
				this.v.x -= this.acceleration * accel * dt;
			} else if (this.inputs.right) {
				this.v.x += this.acceleration * accel * dt;
			} else {
				this.v.x *= 0.94;
			}
			this.v.x = Funcs.constrain(this.v.x, -this.speed * speed, this.speed * speed);
			this.x += this.v.x * dt;
			this.action = 'air';
			return;
		}
		if (this.inputs.left && !this.collide.left) {
			this.v.x -= this.acceleration * dt;
			this.dir = -1;
		} else if (this.inputs.right && !this.collide.right) {
			this.v.x += this.acceleration * dt;
			this.dir = 1;
		} else {
			this.v.x /= this.friction;
		}
		this.action = this.collide.top ? (Math.abs(this.v.x) > 0.1 ? 'walk' : 'idle') : 'air';
		this.x += this.v.x * dt;
		this.v.x = Funcs.constrain(this.v.x, -this.speed, this.speed);
	}

	moveY(dt) {
		this.inputs.up = input.press('Up');
		this.inputs.down = input.press('Down');
		if (this.inWater) {
			const surface = this.water.waterSurfaceLineAt(this.x + this.w / 2);
			const depth = surface === null ? 999 : surface - this.y;
			if (this.inputs.up) {
				this.v.y -= this.jumpPow * 0.55 * dt;
			} else if (this.inputs.down) {
				this.v.y += this.jumpPow * 0.6 * dt;
			} else {
				this.v.y += this.gravity * 0.12 * dt;
			}
			if (depth > 0 && depth < WATER_SPRING.tensionBand) {
				this.v.y += WATER_SPRING.surfaceTension * (1 - depth / WATER_SPRING.tensionBand) * dt;
			}
			if (depth > 0 && depth < WATER_SPRING.skimBand && !this.inputs.down && (this.inputs.left || this.inputs.right)) {
				this.v.y -= WATER_SPRING.skimLift * dt;
			}
			this.v.y = Funcs.constrain(this.v.y * 0.988, -WATER_SPRING.maxSwimSpeed, WATER_SPRING.maxSwimSpeed);
			this.y += this.v.y * dt;
			this.action = 'air';
			return;
		}
		if (this.inputs.up && this.collide.top) {
			this.v.y = -this.jumpPow;
		}
		this.v.y += this.gravity * dt;
		this.y += this.v.y * dt;
		if (!this.collide.top) {
			this.action = 'air';
		}
	}

	// draw(dt) {
		
	// 	const sprites = gfx?.player;
	// 	const state = this.inWater ? 'fall' : !this.collide.top ? (this.v.y < 0 ? 'jump' : 'fall') : Math.abs(this.v.x) > 8 ? 'run' : 'idle';
	// 	const set = sprites?.[state] || sprites?.idle;
	// 	if (!set?.length) {
	// 		graphics.ctx.fillStyle = 'rgb(100, 255, 100)';
	// 		graphics.ctx.fillRect(this.x, this.y, this.w, this.h);
	// 		return;
	// 	}
	// 	if (state !== this.animState) {
	// 		this.animState = state;
	// 		this.animFrame = 0;
	// 		this.animTimer = 0;
	// 	}
	// 	const duration = state === 'run' ? Funcs.constrain(0.16 - Math.abs(this.v.x) / this.speed * 0.1, 0.045, 0.16) : 0.12;
	// 	this.animTimer += dt;
	// 	while (this.animTimer >= duration && set.length > 1) {
	// 		this.animTimer -= duration;
	// 		this.animFrame = (this.animFrame + 1) % set.length;
	// 	}
	// 	if (this.v.x > 8) {
	// 		this.dir = 1;
	// 	} else if (this.v.x < -8) {
	// 		this.dir = -1;
	// 	}
	// 	const frame = set[Math.min(this.animFrame, set.length - 1)];
	// 	const w = frame.w * PIXEL_SIZE, h = frame.h * PIXEL_SIZE;
	// 	graphics.ctx.push()
	// 	graphics.ctx.scale(this.dir, 1);
	// 	this.animator.run('lettuce', this.x, this.y, dt, 'replay');
	// 	graphics.ctx.pop();
	// 	frame.draw(graphics.ctx, Math.round((this.x + this.w / 2 - w / 2 - 3) / PIXEL_SIZE) * PIXEL_SIZE, Math.round((this.y + this.h - h + 10) / PIXEL_SIZE) * PIXEL_SIZE, PIXEL_SIZE, this.dir);
	// }

	draw(dt) {
		if (this.v.x > 8) {
            this.dir = 1;
        } else if (this.v.x < -8) {
            this.dir = -1;
        }

		graphics.ctx.save();
        graphics.ctx.scale(this.dir, 1);

        this.animator.run('player', this.x - this.w / 2 - 10, this.y - this.h / 2, dt, 'replay');

        graphics.ctx.restore();
	}
}
