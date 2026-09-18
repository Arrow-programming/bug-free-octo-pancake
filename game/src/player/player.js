import { BLOCK_SIZE, PIXEL_SIZE, WATER_SPRING, SLOP } from '../utils/constants.js';
import { Funcs } from '../utils/funcs.js';
import { input } from '../utils/input.js';
import { gfx } from '../../assets/art/pixelart.js';
import { graphics } from '../graphics.js';
import { Hitbox, HitboxSide } from '../utils/hitbox.js';

const timeSort = (first, last) => first.minimumTime - last.minimumTime;
const blockFilter = el => el.isSolid; //el.type->plattype == pobj::PlatType::block;
import { Animator } from '../sprites.js';

export class Player {
	constructor({ water, onPortal, onImpact } = {}) {
		this.water = water;
		this.onPortal = onPortal ?? (() => {});
		this.onImpact = onImpact ?? (() => {});
		this.animator = new Animator('player')
		this.reset();
	}

	static w = BLOCK_SIZE - 5;
	static h = 65;

	reset(x = 300, y = 300) {
		const hbox = Hitbox.fromSize(x, y, Player.w, Player.h);
		Object.assign(this, {
			x, y, w: Player.w, h: Player.h,
			hbox, pbox: new Hitbox(hbox),
			health: 10, acceleration: 30000,
			friction: 1.1, jumpPow: 840,
			gravity: 2400, speed: 200,
			pastSlip: 0.99,
			dir: 1, animState: 'idle',
			animFrame: 0, animTimer: 0,
			inWater: false, wasInWater: false,
			action: 'idle',
			xv: 0, yv: 0,
			collisionData: { L: false, R: false, U: false, D: false },
			inputs: { L: false, R: false, U: false, D: false },
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
		for (const obj of objs) {
            if (Hitbox.staticCollision(this.hbox, obj.hbox)) {
                return true;
            }
        }
		return 0;
    }

	touchingOneFilter(objs, predicate) {
		for (const obj of objs) {
            if (predicate(obj) && Hitbox.staticCollision(this.hbox, obj.hbox)) {
                return true;
            }
        }
		return 0;
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

			this.collisionData.R = false;
			this.collisionData.U = false;
			this.collisionData.L = false;
			this.collisionData.D = false;

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

				if (!blk.isSolid) continue;
				
				const scdo = { 
					minimumTime: 0,
					collisionSide: 0,
					associatedBlock: blk,
				};

				Hitbox.sweepCollision(this.pbox, this.hbox, blk.pbox, blk.hbox, scdo);
				
				if (scdo.side == HitboxSide.U) {
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
							this.collisionData.R = true;
							break;
						case HitboxSide.U:
							// player above
							this.y = b.hbox.y1 - Player.h - 1e-6;
							// carefully nudge the player's position to avoid floating point precision issues
							while (this.y + Player.h >= b.hbox.y1) this.y = Funcs.epsilonDown(this.y);
							this.yv = b.yv;
							this.collisionData.U = true;
							break;
						case HitboxSide.L:
							// player on left
							this.x = b.hbox.x1 - Player.w - 1e-6;
							// carefully nudge the player's position to avoid floating point precision issues
							while (this.x + Player.w >= b.hbox.x1) this.x = Funcs.epsilonDown(this.x);
							this.xv = b.xv;
							this.collisionData.L = true;
							break;
						case HitboxSide.D:
							// player below
							this.y = Funcs.epsilonUp(b.hbox.y2);
							this.yv = b.yv;
							//coyoteStart = Infinity;
							this.coyoteVel = b.yv;
							this.collisionData.D = true;
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
			const slip = slipn == 0 ? this.pastSlip : slipprod ** (1.0 / slipn);
			this.pastSlip = slip;

			outFrictionObject.slip = slip;
			outFrictionObject.slipvel = slipvel;
		} finally {
			this.pbox.set(this.hbox);
		}
	}

	moveX(dt) {
		this.inputs.L = input.press('L');
		this.inputs.R = input.press('R');
		if (this.inWater) {
			const surface = this.water.waterSurfaceLineAt(this.x + Player.w / 2);
			const depth = surface === null ? 999 : surface - this.y;
			const atSurface = depth > 0 && depth < WATER_SPRING.skimBand;
			const accel = atSurface ? WATER_SPRING.skimAccelMul : 0.35;
			const speed = atSurface ? WATER_SPRING.skimSpeedMul : 0.7;
			if (this.inputs.L) {
				this.xv -= this.acceleration * accel * dt;
			} else if (this.inputs.R) {
				this.xv += this.acceleration * accel * dt;
			} else {
				this.xv *= 0.94;
			}
			this.xv = Funcs.constrain(this.xv, -this.speed * speed, this.speed * speed);
			this.x += this.xv * dt;
			this.action = 'air';
			return;
		}
		if (this.inputs.L && !this.collisionData.L) {
			this.xv -= this.acceleration * dt;
			this.dir = -1;
		} else if (this.inputs.R && !this.collisionData.R) {
			this.xv += this.acceleration * dt;
			this.dir = 1;
		} else {
			this.xv /= this.friction;
		}
		this.action = this.collisionData.U ? (Math.abs(this.xv) > 0.1 ? 'walk' : 'idle') : 'air';
		this.x += this.xv * dt;
		this.xv = Funcs.constrain(this.xv, -this.speed, this.speed);
	}

	moveY(dt) {
		this.inputs.U = input.press('U');
		this.inputs.D = input.press('D');
		if (this.inWater) {
			const surface = this.water.waterSurfaceLineAt(this.x + Player.w / 2);
			const depth = surface === null ? 999 : surface - this.y;
			if (this.inputs.U) {
				this.yv -= this.jumpPow * 0.55 * dt;
			} else if (this.inputs.D) {
				this.yv += this.jumpPow * 0.6 * dt;
			} else {
				this.yv += this.gravity * 0.12 * dt;
			}
			if (depth > 0 && depth < WATER_SPRING.tensionBand) {
				this.yv += WATER_SPRING.surfaceTension * (1 - depth / WATER_SPRING.tensionBand) * dt;
			}
			if (depth > 0 && depth < WATER_SPRING.skimBand && !this.inputs.D && (this.inputs.L || this.inputs.R)) {
				this.yv -= WATER_SPRING.skimLift * dt;
			}
			this.yv = Funcs.constrain(this.yv * 0.988, -WATER_SPRING.maxSwimSpeed, WATER_SPRING.maxSwimSpeed);
			this.y += this.yv * dt;
			this.action = 'air';
			return;
		}
		if (this.inputs.U && this.collisionData.U) {
			this.yv = this.coyoteVel - this.jumpPow;
		}
		this.yv += this.gravity * dt;
		this.y += this.yv * dt;
		if (!this.collisionData.U) {
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
		if (this.xv > 8) {
            this.dir = 1;
        } else if (this.xv < -8) {
            this.dir = -1;
        }

		this.animator.run('player', this.x - Player.w / 2 - 20, this.y - Player.h / 2, dt, 'replay', this.dir);
	}
}
