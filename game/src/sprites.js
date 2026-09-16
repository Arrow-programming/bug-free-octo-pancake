
import { graphics } from './graphics.js';
import { PIXEL_SIZE } from './utils/constants.js';

class Spritesheet {
    constructor(srcName) {
        this.srcName = srcName;
        this.image = new Image();
        this.image.src = `./assets/art/${srcName}.png`;

        this.animations = {};
    }

    async load() {
        await this.image.decode();

        const response = await fetch(`./assets/art/artData.json`);
        this.data = await response.json();

        this.buildSprites();
    }

    buildSprites() {
        for (const [spriteName, spriteData] of Object.entries(this.data)) {
            this.animations[spriteName] = {
                frames: spriteData.frames.map(frame => {
                    const { x, y, w, h } = frame.frame;
                    return {
                        x: x,
                        y: y,
                        w: w,
                        h: h,
                        duration: frame.duration / 1000
                    }
                }),
            }
        }
    }
}

export const spritesheet = new Spritesheet('untitled1');

export class Animator {
    constructor() {
        this.timer = 0;
        this.currFrame = 0;
        this.runTypes = {
            stop: () => 0,
            replay: (frames) => {
                while (this.timer >= frames[this.currFrame].duration) {
                    this.timer -= frames[this.currFrame].duration;
                    this.currFrame++;

                    if (this.currFrame >= frames.length) {
                        this.currFrame = 0;
                    }
                }

                return this.currFrame;
            },
            bounce: () => {
                
            }
        }
    }
    
    run(sprite, x, y, dt, runType) {
        const animation = spritesheet.animations[sprite];
        const frames = animation.frames;

        this.timer += dt;

        this.currFrame = typeof runType === 'function' ? runType() : this.runTypes[runType](frames);

        const frame = frames[this.currFrame];
        
        graphics.pixCtx.drawImage(
            spritesheet.image,
            frame.x,
            frame.y,
            frame.w,
            frame.h,
            x / PIXEL_SIZE,
            y / PIXEL_SIZE,
            frame.w,
            frame.h
        );
    }
}



await spritesheet.load()
