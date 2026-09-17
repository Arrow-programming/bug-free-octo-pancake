import { BLOCK_SIZE, PIXEL_SIZE, WATER_SPRING, SLOP } from '../utils/constants.js';
import { Funcs } from '../utils/funcs.js';
import { input } from '../utils/input.js';
import { gfx } from '../../assets/art/pixelart.js';
import { graphics } from '../graphics.js';
import { Hitbox, HitboxSide } from '../utils/hitbox.js';

const timeSort = (first, last) => first.minimumTime - last.minimumTime;
const blockFilter = el => true; //el.type->plattype == pobj::PlatType::block;

export class Player {
	constructor({ water, onPortal, onImpact } = {}) {
		this.water = water;
		this.onPortal = onPortal ?? (() => {});
		this.onImpact = onImpact ?? (() => {});
		this.reset();
	}

	static w = BLOCK_SIZE - 5;
	static h = 65;

	reset(x = 300, y = 300) {
		const hbox = Hitbox.fromSize(x, y, Player.w, Player.h);
		Object.assign(this, {
			x, y, w: Player.w, h: Player.h,
			hbox, pbox: new Hitbox(hbox),
			health: 10, acceleration: 1600,
			friction: 1.1, jumpPow: 420,
			gravity: 600, speed: 200,
			pastSlip: 0.99,
			dir: 1, animState: 'idle',
			animFrame: 0, animTimer: 0,
			inWater: false, wasInWater: false,
			action: 'idle',
			xv: 0, yv: 0,
			collisionData: { left: false, right: false, top: false, bottom: false },
			inputs: { left: false, right: false, up: false, down: false },
			inWater: false,
			buffer1: new Array(128),
			buffer2: new Array(128),
			buffer3: new Array(128),
			coyoteVel: 0,
		});
	}

	generateHitbox() {
		this.hbox.setWH(this.x, this.y, Player.w, Player.h);
	}

	touching(objs, out) {
        out.length = 0;
        for (const obj of objs) {
            if (Hitbox.staticCollision(this.hbox, obj.hbox)) {
                out.push(obj);
            }
        }
        return out;
    }

	touchingOne(objs) {
		return objs.some(obj => Hitbox.staticCollision(this.hbox, obj.hbox));
    }

	touchingOneFilter(objs, predicate) {
		return objs.some(obj => predicate(obj) && Hitbox.staticCollision(this.hbox, obj.hbox));
    }

	/**
	 * 
	 * @param {*} blocks 
	 * @param {{ slip: number, slipvel: number }} outFrictionObject 
	 */
	collide(blocks, outFrictionObject) {
		try {
			// Adapted from xyzyyxx's platformer engine by xyzyyxx.

			// for friction
			let slipvelsum = 0;
			let slipn = 0;
			let slipprod = 1;

			this.collisionData.right = false;
			this.collisionData.top = false;
			this.collisionData.left = false;
			this.collisionData.bottom = false;

			// broad-phase check: is the player touching any elements?
			this.generateHitbox();
			let t = this.touching(blocks, this.buffer1);
			this.buffer2.length = 0; let tb = this.buffer2;
			this.buffer3.length = 0; let te = this.buffer3;
			if (t.length == 0) {
				outFrictionObject.slip = this.pastSlip;
				outFrictionObject.slipvel = 0;
				return;
			}

			// if the player is, and if the element is a block, do a sweep collision
			// test the player's sweep and the block's sweep, and see what is the first time in which they collide
			// and figure out on which side they collided in
			for (const blk of t) {
				/*
				const plattype = blk->type->plattype;
				if (plattype != pobj::PlatType::block) {
					te.push_back(blk);
					continue;
				}*/
				
				const scdo = { 
					minimumTime: 0,
					collisionSide: 0,
					associatedBlock: blk,
				};

				Hitbox.sweepCollision(this.pbox, this.hbox, blk.pbox, blk.hbox, scdo);
				
				if (scdo.side == HitboxSide.up) {
					slipvelsum += blk.xv;
					++slipn;
					slipprod *= 0.99; // TEMPORARY.
					/*
					if (std::holds_alternative<pobj::BlockPhysData>(blk->type->physData)) {
						auto slip = std::get<pobj::BlockPhysData>(blk->type->physData).slip;
						slipprod *= slip;
					} else panicf("Error: Block type \"{}\" does not have metadata of type pobj::BlockPhysData", blk->type->name.c_str());*/
				}
				
				tb.push(scdo);
			}

			// sort by time
			tb.sort(timeSort);

			// correct the player's position
			for (const scdo of tb) {
				const b = scdo.associatedBlock;
				const s = scdo.collisionSide;
				if (scdo.minimumTime != Infinity && Hitbox.staticCollision(this.hbox, b.hbox)) {
					switch (s) {
						case HitboxSide.R:
							// player on right
							this.x = Funcs.epsilonUp(b.hbox.x2);
							this.xv = b.xv;
							this.collisionData.right = true;
							break;
						case HitboxSide.U:
							// player above
							this.y = b.hbox.y1 - Player.h - 1e-6;
							// carefully nudge the player's position to avoid floating point precision issues
							while (this.y + Player.h >= b.hbox.y1) this.y = Funcs.epsilonDown(this.y);
							this.yv = b.yv;
							this.collisionData.top = true;
							break;
						case HitboxSide.L:
							// player on left
							this.x = b.hbox.x1 - Player.w - 1e-6;
							// carefully nudge the player's position to avoid floating point precision issues
							while (this.x + Player.w >= b.hbox.x1) this.x = Funcs.epsilonDown(this.x);
							this.xv = b.xv;
							this.collisionData.left = true;
							break;
						case HitboxSide.D:
							// player below
							this.y = Funcs.epsilonUp(b.hbox.y2);
							this.yv = b.yv;
							//coyoteStart = Infinity;
							this.coyoteVel = b.yv;
							this.collisionData.bottom = true;
							break;
						default:
							console.error(`error: unknown HitboxSide ${s}`);
					}
					this.generateHitbox();
				}
			}
			/*
			// now do action for all the elements it
			// is still touching
			for (auto el: te) {
				if (this.hbox.collide(el->hbox)) {
					elAction(*el);
					this.generateHitbox();
				}
			}*/
			
			// if fails, die
			if (this.touchingOneFilter(blocks, blockFilter, -SLOP)) {
				this.health = 0;
				outFrictionObject.slip = this.pastSlip;
				outFrictionObject.slipvel = 0;
				return;
			}
			
			// friction
			const slipvel = slipn == 0 ? 0 : slipvelsum / slipn;
			const slip = slipn == 0 ? pastSlip : slipprod ** (1.0 / slipn);
			this.pastSlip = slip;

			outFrictionObject.slip = slip;
			outFrictionObject.slipvel = slipvel;
		} finally {
			this.pbox.set(this.hbox);
		}
	}

	moveX(dt) {
		this.inputs.left = input.press('Left');
		this.inputs.right = input.press('Right');
		if (this.inWater) {
			const surface = this.water.waterSurfaceLineAt(this.x + Player.w / 2);
			const depth = surface === null ? 999 : surface - this.y;
			const atSurface = depth > 0 && depth < WATER_SPRING.skimBand;
			const accel = atSurface ? WATER_SPRING.skimAccelMul : 0.35;
			const speed = atSurface ? WATER_SPRING.skimSpeedMul : 0.7;
			if (this.inputs.left) {
				this.xv -= this.acceleration * accel * dt;
			} else if (this.inputs.right) {
				this.xv += this.acceleration * accel * dt;
			} else {
				this.xv *= 0.94;
			}
			this.xv = Funcs.constrain(this.xv, -this.speed * speed, this.speed * speed);
			this.x += this.xv * dt;
			this.action = 'air';
			return;
		}
		if (this.inputs.left && !this.collisionData.left) {
			this.xv -= this.acceleration * dt;
			this.dir = -1;
		} else if (this.inputs.right && !this.collisionData.right) {
			this.xv += this.acceleration * dt;
			this.dir = 1;
		} else {
			this.xv /= this.friction;
		}
		this.action = this.collisionData.top ? (Math.abs(this.xv) > 0.1 ? 'walk' : 'idle') : 'air';
		this.x += this.xv * dt;
		this.xv = Funcs.constrain(this.xv, -this.speed, this.speed);
	}

	moveY(dt) {
		this.inputs.up = input.press('Up');
		this.inputs.down = input.press('Down');
		if (this.inWater) {
			const surface = this.water.waterSurfaceLineAt(this.x + Player.w / 2);
			const depth = surface === null ? 999 : surface - this.y;
			if (this.inputs.up) {
				this.yv -= this.jumpPow * 0.55 * dt * 1000;
			} else if (this.inputs.down) {
				this.yv += this.jumpPow * 0.6 * dt;
			} else {
				this.yv += this.gravity * 0.12 * dt;
			}
			if (depth > 0 && depth < WATER_SPRING.tensionBand) {
				this.yv += WATER_SPRING.surfaceTension * (1 - depth / WATER_SPRING.tensionBand) * dt;
			}
			if (depth > 0 && depth < WATER_SPRING.skimBand && !this.inputs.down && (this.inputs.left || this.inputs.right)) {
				this.yv -= WATER_SPRING.skimLift * dt;
			}
			this.yv = Funcs.constrain(this.yv * 0.988, -WATER_SPRING.maxSwimSpeed, WATER_SPRING.maxSwimSpeed);
			this.y += this.yv * dt;
			this.action = 'air';
			return;
		}
		if (this.inputs.up && this.collisionData.top) {
			this.yv = this.coyoteVel - this.jumpPow;
		}
		this.yv += this.gravity * dt;
		this.y += this.yv * dt;
		if (!this.collisionData.top) {
			this.action = 'air';
		}
	}

	draw(dt) {
		const sprites = gfx?.player;
		const state = this.inWater ? 'fall' : !this.collisionData.top ? (this.yv < 0 ? 'jump' : 'fall') : Math.abs(this.xv) > 8 ? 'run' : 'idle';
		const set = sprites?.[state] || sprites?.idle;
		if (!set?.length) {
			graphics.ctx.fillStyle = 'rgb(100, 255, 100)';
			graphics.ctx.fillRect(this.x, this.y, Player.w, Player.h);
			return;
		}
		if (state !== this.animState) {
			this.animState = state;
			this.animFrame = 0;
			this.animTimer = 0;
		}
		const duration = state === 'run' ? Funcs.constrain(0.16 - Math.abs(this.xv) / this.speed * 0.1, 0.045, 0.16) : 0.12;
		this.animTimer += dt;
		while (this.animTimer >= duration && set.length > 1) {
			this.animTimer -= duration;
			this.animFrame = (this.animFrame + 1) % set.length;
		}
		if (this.xv > 8) {
			this.dir = 1;
		} else if (this.xv < -8) {
			this.dir = -1;
		}
		const frame = set[Math.min(this.animFrame, set.length - 1)];
		const w = frame.w * PIXEL_SIZE, h = frame.h * PIXEL_SIZE;
		frame.draw(graphics.ctx, Math.round((this.x + Player.w / 2 - w / 2 - 3) / PIXEL_SIZE) * PIXEL_SIZE, Math.round((this.y + Player.h - h + 10) / PIXEL_SIZE) * PIXEL_SIZE, PIXEL_SIZE, this.dir);
	}
}
