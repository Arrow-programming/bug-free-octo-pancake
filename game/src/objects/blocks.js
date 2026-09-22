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

	get state() { return this.type.state; }
	get emissivity() { return this.type.emissivity; }
	get slip() { return this.type.slip; }
	get velocity() { return this.type.velocity; }
	get jump() { return this.type.jump; }

	draw(blocks) {
		this.type.draw(this, blocks);
	}

	update(dt) {
		this.type.update(this, dt);
	}
}