import { BlockType } from './blocktype.js'
import { gfx } from "../../assets/art/pixelart.js";
import { texStr } from '../../assets/noise.js';
import { BLOCK_SIZE } from '../utils/constants.js';

import { graphics } from '../graphics.js';
import { drawWaterTile } from '../environment/water.js'
import { Fire } from '../environment/fire.js';

let fireTexture = null;

export async function ready() {
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
    fireTexture = context.getImageData(0, 0, 600, 600);

    return true;
}

export const BlockTypes = {
    block: new BlockType({
        name: "block",
        isSolid: true,
        emissivity: 0,
        tileSprite: typeof gfx !== "undefined" && gfx?.tiles?.A?.yyyy ? gfx.tiles.A.yyyy : null,
        draw(block, _) {
            if (this.tileSprite) {
                this.tileSprite.draw(graphics.ctx, block.x, block.y, Math.max(1, block.w / this.tileSprite.w));
            } else {
                graphics.ctx.fillStyle = "rgb(66, 66, 59)";
                graphics.ctx.fillRect(block.x, block.y, block.w, block.h);
            }
        },
    }),
    portal: new BlockType({
        name: "portal",
        isSolid: false,
        emissivity: 1,
        draw(block, _) {
            graphics.ctx.fillStyle = "rgb(200, 100, 200)";
            graphics.ctx.fillRect(block.x, block.y, block.w, block.h);
        },
    }),
    tramp: new BlockType({
        name: "tramp",
        isSolid: false,
        emissivity: 0,
        draw(block, _) {
            graphics.ctx.fillStyle = "rgb(255, 255, 100)";
            graphics.ctx.fillRect(block.x, block.y, block.w, block.h);
        },
    }),
    ice: new BlockType({
        name: "ice",
        isSolid: true,
        emissivity: 0,
        draw(block, _) {
            graphics.ctx.fillStyle = "rgb(100, 100, 200)";
            graphics.ctx.fillRect(block.x, block.y, block.w, block.h);
        },
    }),
    mud: new BlockType({
        name: "mud",
        isSolid: true,
        emissivity: 0,
        draw(block, _) {
            graphics.ctx.fillStyle = "rgb(100, 30, 0)";
            graphics.ctx.fillRect(block.x, block.y, block.w, block.h);
        },
    }),
    hazard: new BlockType({
        name: "hazard",
        isSolid: true,
        emissivity: 1,
        draw(block, _) {
            graphics.ctx.fillStyle = "rgb(255, 100, 100)";
            graphics.ctx.fillRect(block.x, block.y, block.w, block.h);
        },
    }),
    water: new BlockType({
        name: "water",
        isSolid: false,
        emissivity: 0,
        initialize(block, _) {
            block.attributes.buffer1 = [];
            block.attributes._cacheIsTopSurface = null;
        },
        listOfTypes: ["block", "ice", "mud", "tramp", "portal", "hazard"],
        isTopSurface(block, blocks) {
            if (block.attributes._cacheIsTopSurface === null) {
                let above = null;
                for (const key in blocks) {
                    const block2 = blocks[key];
                    if (block2.x === block.x && block2.y === block.y - BLOCK_SIZE) {
                        above = block2;
                        break;
                    }
                }
                if (!above) return true;
                const aboveIsWater = above?.type.name === "water";
                const aboveIsSolid = above && this.listOfTypes.includes(above.type.name);
                block.attributes._cacheIsTopSurface = !aboveIsWater && !aboveIsSolid;
            }
            return block.attributes._cacheIsTopSurface;
        },
        draw(block, blocks) {
            const topSurface = this.isTopSurface(block, blocks);
            drawWaterTile(block.x, block.y, block.w, block.h, topSurface, block.attributes.buffer1);
        },
    }),
    fire: new BlockType({
        name: "fire",
        isSolid: false,
        emissivity: 1,
        initialize(block, { x, y, w = BLOCK_SIZE, h = BLOCK_SIZE, againstWall = false, wallLeft = false, wallRight = false }) {
            const widthInBlocks = w / BLOCK_SIZE;
            const wallLift = againstWall ? 0.75 : 0;
            const riseHeight = h * Math.min(4, 1 + widthInBlocks * 0.5 + wallLift);
            block.attributes.fire = new Fire(x, y - (riseHeight - h), w, riseHeight, { wallLeft, wallRight });
        },
        update(block, dt) {
            block.attributes.fire.update(fireTexture, dt);
        },
        draw(block, _) {
            block.attributes.fire.draw(graphics.ctx);
        },
    })
};