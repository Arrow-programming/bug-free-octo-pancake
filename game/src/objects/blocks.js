/**
 * Holds most of the blocks
 */

import { BLOCK_SIZE } from '../utils/constants.js'

import { graphics } from '../graphics.js'
import { gfx } from "../../assets/art/pixelart.js";
import { drawWaterTile } from '../environment/water.js'
import { Fire } from '../environment/fire.js'

const tileSprite = typeof gfx !== "undefined" && gfx?.tiles?.A?.yyyy ? gfx.tiles.A.yyyy : null;

/* Block */
export class Block {
	constructor(x, y, w, h, type) {
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
		this.type = type;
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
	constructor(x, y, w, h) {
		super(x, y, w, h, "water");
	}

	isTopSurface(blocks) {
		const above = blocks.find((block) => block.x === this.x && block.y === this.y - BLOCK_SIZE);
		const aboveIsWater = above?.type === "water";
		const aboveIsSolid = above && ["block", "ice", "mud", "tramp", "portal", "hazard"].includes(above.type);
		return !aboveIsWater && !aboveIsSolid;
	}

	draw(blocks) {
		const topSurface = this.isTopSurface(blocks);
		drawWaterTile(this.x, this.y, this.w, this.h, topSurface);
	}
}

export class FireBlock extends Block {
	constructor(x, y, w, h) {
		super(x, y, w, h, "fire");
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