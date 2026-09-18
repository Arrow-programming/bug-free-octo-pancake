/**
 * Holds most of the blocks
 */

import { BLOCK_SIZE } from '../utils/constants.js';
import { Hitbox } from '../utils/hitbox.js';

/* Block */
export class Block {
	attributes = {};

	constructor(initializer = {}) {
		const { x, y, w = BLOCK_SIZE, h = BLOCK_SIZE, type } = initializer;
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;

		this.hbox = Hitbox.fromSize(x, y, w, h);
		this.pbox = new Hitbox(this.hbox);

		this.xv = 0;
		this.yv = 0;

		this.type = type;

		type.initialize(this, initializer);
	}

	get isSolid() { return this.type.isSolid; }
	get emissivity() { return this.type.emissivity; }

	draw(blocks) {
		this.type.draw(this, blocks);
	}

	update(dt) {
		this.type.update(this, dt);
	}
}
/*
export class WaterBlock extends Block {
	#buffer1 = [];

	constructor({ x, y } = {}) {
		super({ x: x, y: y, type: "water" });
		this._cacheIsTopSurface = null;
	}

	static listOfTypes = ["block", "ice", "mud", "tramp", "portal", "hazard"];
	isTopSurface(blocks) {
		if (this._cacheIsTopSurface === null) {
			let above = null;
			for (const key in blocks) {
				const block = blocks[key];
				if (block.x === this.x && block.y === this.y - BLOCK_SIZE) {
					above = block;
					break;
				}
			}
			if (!above) return true;
			const aboveIsWater = above?.type === "water";
			const aboveIsSolid = above && WaterBlock.listOfTypes.includes(above.type);
			this._cacheIsTopSurface = !aboveIsWater && !aboveIsSolid;
		}
		return this._cacheIsTopSurface;
	}

	draw(blocks) {
		const topSurface = this.isTopSurface(blocks);
		drawWaterTile(this.x, this.y, this.w, this.h, topSurface, this.#buffer1);
	}
}

export class FireBlock extends Block {
	constructor({ x, y, w = BLOCK_SIZE, h = BLOCK_SIZE, againstWall = false, wallLeft = false, wallRight = false } = {}) {
		super({ x: x, y: y, w: w, h: h, type: "fire" });
		const widthInBlocks = w / BLOCK_SIZE;
		const wallLift = againstWall ? 0.75 : 0;
		const riseHeight = h * Math.min(4, 1 + widthInBlocks * 0.5 + wallLift);
		this.fire = new Fire(x, y - (riseHeight - h), w, riseHeight, { wallLeft, wallRight });
	}
	update(tex, dt) {
		this.fire.update(tex, dt);
	}
	draw() {
		this.fire.draw(graphics.ctx);
	}
}*/