/**
 * Holds most of the blocks
 */

import { BLOCK_SIZE } from '../utils/constants.js';

import { graphics } from '../graphics.js';
import { gfx } from "../../assets/art/pixelart.js";
import { drawWaterTile } from '../environment/water.js'
import { Fire } from '../environment/fire.js';

import { Hitbox } from '../utils/hitbox.js';

const tileSprite = typeof gfx !== "undefined" && gfx?.tiles?.A?.yyyy ? gfx.tiles.A.yyyy : null;

/* Block */
export class Block {
	constructor({x, y, w = BLOCK_SIZE, h = BLOCK_SIZE, type, isSolid = true} = {}) {
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;

		this.hbox = Hitbox.fromSize(x, y, w, h);
		this.pbox = new Hitbox(this.hbox);

		this.xv = 0;
		this.yv = 0;

		this.type = type;
		this.isSolid = isSolid;
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

export class WaterBlock extends Block {
	#buffer1 = [];

	constructor({x, y, isSolid} = {}) {
		super({x:x, y:y, type:"water", isSolid:isSolid});
	}

	static listOfTypes = ["block", "ice", "mud", "tramp", "portal", "hazard"];
	isTopSurface(blocks) {
		const above = blocks.find((block) => block.x === this.x && block.y === this.y - BLOCK_SIZE);
		const aboveIsWater = above?.type === "water";
		const aboveIsSolid = above && WaterBlock.listOfTypes.includes(above.type);
		return !aboveIsWater && !aboveIsSolid;
	}

	draw(blocks) {
		const topSurface = this.isTopSurface(blocks);
		drawWaterTile(this.x, this.y, this.w, this.h, topSurface, this.#buffer1);
	}
}

export class FireBlock extends Block {
	constructor({x, y, w=BLOCK_SIZE, h = BLOCK_SIZE, isSolid} = {}) {
		super({x:x, y:y, w:w, h:h, type:"fire", isSolid:isSolid});
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