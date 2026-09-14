import { texStr } from '../assets/noise.js';
import { gfx } from "../assets/art/pixelart.js";
import { BLOCK_SIZE, PIXEL_SIZE, WATER_SPRING, WATER_WAVE, WATER_LIGHT_BEND, BG_RIPPLE } from './utils/constants.js'
import { graphics, rasterizer } from './graphics.js'
import { keys } from './utils/input.js'
import { Funcs } from './utils/funcs.js'
import { Bounds, Grid, Raster } from './utils/dataStructures.js'
import { Fabric } from './systems/fabric.js'
import * as Water from './environment/water.js'
import { Lighting } from './environment/lighting.js'

import { Block, WaterBlock, FireBlock } from './objects/blocks.js'


//garbage collect
for (let i = window.requestAnimationFrame(function() {}); i > 0; i--) {
    window.cancelAnimationFrame(i);
}

/** setup code for HTML5 Canvas */
graphics.init('game')

//frame manipulation, dt's, fps, etc
let dt, dtMs, fps;
let lastTime = performance.now();

/** Config */
let nxt = true;
let currentLevel = 0;
let blocks = [];
let blockGrid = new Map();


const backdropSprite = typeof gfx !== "undefined" && gfx?.props?.backdrops?.dungeon ? gfx.props.backdrops.dungeon : null;
const playerSprites = typeof gfx !== "undefined" && gfx?.player ? gfx.player : null;

const WATER_LIGHT_ANGLE_DEG = 22;
const WATER_TILT_PER_ROW = -Math.tan(WATER_LIGHT_ANGLE_DEG * Math.PI / 180) * (BLOCK_SIZE / 9);

window.frameTime = 0;

//render helpers for the underwater distortion pass
function ensureFrameBuffer(pad) {
    const neededW = graphics.width + pad * 2;
    if (!frameBuffer || frameBuffer.width !== neededW || frameBuffer.height !== graphics.height) {
        frameBuffer = document.createElement("canvas");
        frameBuffer.width = neededW;
        frameBuffer.height = graphics.height;
        frameBufferCtx = frameBuffer.getContext("2d");
        frameBufferCtx.imageSmoothingEnabled = false;
    }
}


//build a clip region primarily
export function applyUnderwaterDistortion() {
    const waterRects = [];
    for (const block of blocks) {
        if (block.type !== "water") continue;

        if (block.isTopSurface && block.isTopSurface(blocks)) {
            const cols = 9;
            const cellW = block.w / cols;
            for (let col = 0; col < cols; col++) {
                const colX = block.x + col * cellW;
                const surfaceLine = Water.waterSurfaceLineAt(colX + cellW / 2) ?? block.y;
                const rectY = surfaceLine;
                const rectH = (block.y + block.h) - surfaceLine;
                if (rectH <= 0) continue;

                const screenX = colX - cam.x + shake.x + graphics.width / 2;
                const screenY = rectY - cam.y + shake.y + graphics.height / 2;
                if (screenX + cellW < 0 || screenX > graphics.width || screenY + rectH < 0 || screenY > graphics.height) {
                    continue;
                }
                waterRects.push([screenX, screenY, cellW, rectH]);
            }
            continue;
        }

        const screenX = block.x - cam.x + shake.x + graphics.width / 2;
        const screenY = block.y - cam.y + shake.y + graphics.height / 2;
        //keep the clip path limited
        if (screenX + block.w < 0 || screenX > graphics.width || screenY + block.h < 0 || screenY > graphics.height) {
            continue;
        }
        waterRects.push([screenX, screenY, block.w, block.h]);
    }
    if (waterRects.length === 0) {
        return;
    }

    const pad = Math.ceil(UNDERWATER_DISTORT.amp) + 2;
    ensureFrameBuffer(pad);

    frameBufferCtx.drawImage(graphics.canvas, 0, 0, 1, graphics.height, 0, 0, pad, graphics.height);
    frameBufferCtx.drawImage(graphics.canvas, 0, 0, graphics.width, graphics.height, pad, 0, graphics.width, graphics.height);
    frameBufferCtx.drawImage(graphics.canvas, graphics.width - 1, 0, 1, graphics.height, pad + graphics.width, 0, pad, graphics.height);
    
    graphics.ctx.save();
    graphics.ctx.setTransform(1, 0, 0, 1, 0, 0);
    graphics.ctx.beginPath();
    for (const [rx, ry, rw, rh] of waterRects) {
        graphics.ctx.rect(rx, ry, rw, rh);
    }
    graphics.ctx.clip();
    graphics.ctx.imageSmoothingEnabled = false;

    const t = frameTime / 1000;
    const rowH = UNDERWATER_DISTORT.rowHeight;
    for (let y = 0; y < graphics.height; y += rowH) {
        const rh = Math.min(rowH, graphics.height - y);
        const wave = Math.sin(y * UNDERWATER_DISTORT.freq + t * UNDERWATER_DISTORT.speed);
        //quantize the shift to whole in-game pixels (multiples of PIXEL_SIZE) so the warp
        //looks like the pixel art is stepping, not sliding around at sub-pixel amounts
        const shift = Math.round((wave * UNDERWATER_DISTORT.amp) / PIXEL_SIZE) * PIXEL_SIZE;
        graphics.ctx.drawImage(
            frameBuffer,
            pad - shift, y, graphics.width, rh,
            0, y, graphics.width, rh
        );
    }
    graphics.ctx.restore();
}

const UNDERWATER_DISTORT = {
    rowHeight: PIXEL_SIZE,
    amp: PIXEL_SIZE * 2,
    freq: WATER_WAVE.freq, 
    speed: WATER_WAVE.speed,
};
let frameBuffer = null;
let frameBufferCtx = null;


/* 
    BACKGROUND RENDERING
*/

let bgFrameBuffer = null;
let bgFrameBufferCtx = null;

function ensureBgFrameBuffer(pad) {
    const neededW = graphics.width + pad * 2;
    if (!bgFrameBuffer || bgFrameBuffer.width !== neededW || bgFrameBuffer.height !== graphics.height) {
        bgFrameBuffer = document.createElement("canvas");
        bgFrameBuffer.width = neededW;
        bgFrameBuffer.height = graphics.height;
        bgFrameBufferCtx = bgFrameBuffer.getContext("2d");
        bgFrameBufferCtx.imageSmoothingEnabled = false;
    }
}

function drawBackgroundArt() {
    //no active disturbances, just draw the backdrop
    if (!Water.waterLightDisturbances.length) {
        graphics.ctx.save();
        graphics.ctx.fillStyle = "#111827";
        graphics.ctx.fillRect(0, 0, graphics.width, graphics.height);

        if (backdropSprite) {
            const pixel = PIXEL_SIZE;
            const spriteW = backdropSprite.w * pixel;
            const spriteH = backdropSprite.h * pixel;
            const offsetX = ((Math.floor(-cam.x * 0.08) % spriteW) + spriteW) % spriteW;
            for (let x = -spriteW; x < graphics.width + spriteW; x += spriteW) {
                for (let y = -spriteH; y < graphics.height + spriteH; y += spriteH) {
                    backdropSprite.draw(graphics.ctx, x + offsetX, y, pixel);
                }
            }
        }

        graphics.ctx.restore();
        return;
    }

    const pad = Math.ceil(BG_RIPPLE.amp) + 2;
    ensureBgFrameBuffer(pad);

    bgFrameBufferCtx.fillStyle = "#111827";
    bgFrameBufferCtx.fillRect(0, 0, bgFrameBuffer.width, graphics.height);

    if (backdropSprite) {
        const pixel = PIXEL_SIZE;
        const spriteW = backdropSprite.w * pixel;
        const spriteH = backdropSprite.h * pixel;
        const offsetX = ((Math.floor(-cam.x * 0.08) % spriteW) + spriteW) % spriteW;
        for (let x = -pad - spriteW; x < graphics.width + pad + spriteW; x += spriteW) {
            for (let y = -spriteH; y < graphics.height + spriteH; y += spriteH) {
                backdropSprite.draw(bgFrameBufferCtx, x + offsetX + pad, y, pixel);
            }
        }
    }

    graphics.ctx.save();
    graphics.ctx.imageSmoothingEnabled = false;
    const worldSampleX = cam.x;
    const rowH = PIXEL_SIZE;
    for (let y = 0; y < graphics.height; y += rowH) {
        const rh = Math.min(rowH, graphics.height - y);
        const worldY = y + cam.y - shake.y - graphics.height / 2;
        const bend = Water.backgroundRippleBendAt(worldSampleX, worldY);
        //quantize to whole in-game pixels, same reasoning as the underwater distortion pass
        const shift = Funcs.constrain(Math.round(bend / PIXEL_SIZE) * PIXEL_SIZE, -pad, pad);
        graphics.ctx.drawImage(
            bgFrameBuffer,
            pad - shift, y, graphics.width, rh,
            0, y, graphics.width, rh
        );
    }
    graphics.ctx.restore();
}

/*END BACKGROUND RENDERING*/

const MAP = [
    [
        "  	   ",
        "  	                  !",
        "  	  ",
        "  	              !!",
        "	         FFF",
        "	        ####",
        "	       @   %##",
        "	        ######",
        "	#WWWWWW##  !!# #####",
        "   #WWWWWW##",
        "	 ##WWWWW#####", 
        "	 ####WWWWW#####",
        "      #WWWWWWWW########",
        "      #WWWWWWWWWW######",
        "########WWWWWWWWWW#######",
        "####WWWWWWWWWWWWWWWWW#######",
        "##WWWWWWWWWWWWWWWWWWWWW#######",
        "#######WWWWWWWWWWWWWWW######",
        "#######################",
        "",
    ],
    [
        "     ",
        " #   #",
        "#   !#",
        "     #!", 
        "#        ",
        "#@         ", 
        "####&&!# %",
        "#############",
    ],
    [
        
        "#! ! !",
        "# # # #",
        "#    ",
        "",
        "@  !",
        "# !#",
        "!  %",
        "",
        "###",
    
    ],
    [
        " ",
        " #",
        " #",
        " # @#", 
        " ###",
        " ! !##",
        "   ",
        " #  ",
        " #%###",
    ],
    [
        
        "#################",
        "    #######",
        " #####!",
        "###       ",
        "#!       !   !",
        "#     @  !   !",
        "       #########",
        " #######%",
        "####   #",
        "!#      w#######",
    ],
    [
        
        "",    
        "",
        "",
        "        #      #      #",
        "@  #    !      !      %",
        "#  !",
        "!",
    ],
    [
        "  ##!",
        "  !###",    
        " ## ###",
        " #! #!",
        "  # ##@",
        "  % ####       %",
        "    ############",
    ],
    [],
];




/** Player */
export const player = {
    //Starting x and y coords
    x: 300,
    y: 300,
    
    //The width and height
    w: BLOCK_SIZE - 5,
    h: 65,
    
    collide: {
        left: false,
        right: false,
        top: false,
        bottom: false
    },
    inputs: {
        left: null,
        right: null,
        up: null,
    },
    v: {
        x: 0,
        y: 0,
    },
    jump: false,
    
    acceleration: 1600,
    friction: 1.1,
    jumpPow: 420,
    gravity: 600,
    speed: 200,
    
    //Players health num
    health: 10,
    //Is the player on any of these blocks?
    onTramp: false,
    onIce: false,
    onMud: false,
    inWater: false,
    wasInWater: false,

    //facing direction for sprite flip, animation bookkeeping
    dir: 1,
    animState: "idle",
    animFrame: 0,
    animTimer: 0,
    
    collideX: function(that){
        //first check if the player is touching a block
        if(Funcs.edgeCheck(this, that)){
            if(that.type === "hazard"){
                this.health -= 10;
            }
            else if(that.type === "portal"){
                nxt = true;
            }
            //vector velocity can determine what side
            else if(this.v.x > 0){
                this.collide.right = true;
                this.x = that.x - this.w;
            }
            else {
                this.collide.left = true;
                this.x = that.x + that.w;
            }
            
            //the player is colliding
            that.colX = true;
            return true;
        }
        //the player is not colliding on the x-axis
        this.collide.left = false;
        this.collide.right = false;
        that.colX = false;
        return false;
    },
    collideY: function(that){
        //is the player touching a block?
        if(Funcs.edgeCheck(this, that)){
            
            if(this.type === "ice"){
                //no work
                this.acceleration = 4;
                this.speed = 10;
                this.friction = 1;
            }
            if(that.type === "hazard"){
                this.health -= 10;
            }
            else if(that.type === "portal"){
                nxt = true;
            }
            //vector velocity can determine orientation
            else if(this.v.y > 0){
                shakes.push(new Shake(this.v.y/60))
                this.collide.top = true;
                this.y = that.y - this.h;
                this.v.y = 0;
            }
            else {
                this.collide.bottom = true;
                this.y = that.y + that.h;
                this.v.y *= -0.1;
            }
            
            
            //the player is colliding on the y-axis
            that.colY = true;
            return true;
        }
        //the player is not colliding on the y-axis
        this.collide.top = false;
        this.collide.bottom = false;
        that.colY = false;
        return false;
    },
    
    moveX: function(){
        this.inputs.left = (keys[37] || keys[65]);
        this.inputs.right = (keys[39] || keys[68]);
        
        if (this.inWater) {
            const centerX = this.x + this.w / 2;
            const surfaceLine = Water.waterSurfaceLineAt(centerX);
            const headDepth = surfaceLine === null ? 999 : surfaceLine - this.y;
            const atSurface = headDepth > 0 && headDepth < WATER_SPRING.skimBand;
            const accelMul = atSurface ? WATER_SPRING.skimAccelMul : 0.35;
            const speedMul = atSurface ? WATER_SPRING.skimSpeedMul : 0.7;

            if (this.inputs.left) {
                this.v.x -= this.acceleration * accelMul * dt;
            } else if (this.inputs.right) {
                this.v.x += this.acceleration * accelMul * dt;
            } else {
                this.v.x *= 0.94;
            }
            this.v.x = Funcs.constrain(this.v.x, -this.speed * speedMul, this.speed * speedMul);
            this.x += this.v.x * dt;
            this.action = "air";
            return;
        }
        
        //vector movement
        if(this.inputs.left && !this.collide.left){
            this.v.x -= this.acceleration * dt;
            if(!this.collide.top){
                this.action = "air";
            }
            else if(!this.collide.right){
                this.action = "walk";
            }
            else {
                this.action = "idle";
            }
            this.dir = -1;
        }
        else if (this.inputs.right && !this.collide.right) { 
            this.v.x += this.acceleration * dt;
            if(!this.collide.top){
                this.action = "air";
            }
            else if(Math.abs(this.v.x) > 0.1){
                this.action = "walk";
            }
            else {
                this.action = "idle";
            }
            this.dir = 1;
        }
        else {
            this.v.x /= this.friction; 
            if(this.collide.top){
                this.action = "idle";
            }
        }
        
        //fixes an annoying bug
        if(this.v.x !== 0){
            this.x += this.v.x * dt;
        }
        this.v.x = Funcs.constrain(this.v.x, -this.speed, this.speed);
    },
    moveY: function(){
        this.inputs.up = (keys[38] || keys[87]);
        this.inputs.down = (keys[40] || keys[83]);

        if (this.inWater) {
            const centerX = this.x + this.w / 2;
            const surfaceLine = Water.waterSurfaceLineAt(centerX);
            const headDepth = surfaceLine === null ? 999 : surfaceLine - this.y;

            if (this.inputs.up) {
                //swim up
                this.v.y -= this.jumpPow * 0.55 * dt;
                const band = WATER_SPRING.tensionBand;
                if (headDepth > 0 && headDepth < band) {
                    this.v.y += WATER_SPRING.surfaceTension * (1 - headDepth / band) * dt;
                }
            } else if (this.inputs.down) {
                //swim down when holding down
                this.v.y += this.jumpPow * 0.6 * dt;
            } else {
                //slight natural sinking
                this.v.y += this.gravity * 0.12 * dt;
            }

            const atSurface = headDepth > 0 && headDepth < WATER_SPRING.skimBand;
            if (atSurface && !this.inputs.down && (this.inputs.left || this.inputs.right)) {
                this.v.y -= WATER_SPRING.skimLift * dt;
            }

            //no vertical damping (reduced)
            this.v.y *= 0.988;
            this.v.y = Funcs.constrain(this.v.y, -WATER_SPRING.maxSwimSpeed, WATER_SPRING.maxSwimSpeed);
            this.y += this.v.y * dt;
            this.action = "air";
            return;
        }
            
        if (this.inputs.up && this.collide.top) {
            this.v.y = -this.jumpPow;
            this.action = "air";
        }
        this.v.y += this.gravity * dt;
        this.y += this.v.y * dt;
        if(!this.collide.top) {
            this.action = "air";
        }
    },

    //Merge into one function
    display: function() {
        graphics.ctx.fillStyle = "rgb(100, 255, 100)";
        //ctx.fillRect(this.x, this.y, this.w, this.h);
        

        //pick which animation set to play based on current movement state
        let stateKey;
        if (this.inWater) {
            stateKey = "fall";
        } else if (!this.collide.top) {
            stateKey = this.v.y < 0 ? "jump" : "fall";
        } else if (Math.abs(this.v.x) > 8) {
            stateKey = "run";
        } else {
            stateKey = "idle";
        }
        const set = playerSprites[stateKey] || playerSprites.idle;
        if (!set || !set.length) {
            graphics.ctx.fillStyle = "rgb(100, 255, 100)";
            graphics.ctx.fillRect(this.x, this.y, this.w, this.h);
            return;
        }

        //reset the animation when switching states so it always starts on frame 0
        if (stateKey !== this.animState) {
            this.animState = stateKey;
            this.animFrame = 0;
            this.animTimer = 0;
        }

        //faster leg cycling the faster the player is actually moving
        const frameDuration = stateKey === "run"
            ? Funcs.constrain(0.16 - Math.abs(this.v.x) / this.speed * 0.1, 0.045, 0.16)
            : 0.12;

        if (set.length > 1) {
            this.animTimer += dt;
            while (this.animTimer >= frameDuration) {
                this.animTimer -= frameDuration;
                this.animFrame = (this.animFrame + 1) % set.length;
            }
        } else {
            this.animFrame = 0;
        }

        if (this.v.x > 8) this.dir = 1;
        else if (this.v.x < -8) this.dir = -1;

        const frame = set[Math.min(this.animFrame, set.length - 1)];
        const spriteW = frame.w * PIXEL_SIZE;
        const spriteH = frame.h * PIXEL_SIZE;

        const rawX = this.x + this.w / 2 - spriteW / 2 - 3;
        const rawY = this.y + this.h - spriteH + 10;
        const drawX = Math.round(rawX / PIXEL_SIZE) * PIXEL_SIZE;
        const drawY = Math.round(rawY / PIXEL_SIZE) * PIXEL_SIZE;

        frame.draw(graphics.ctx, drawX, drawY, PIXEL_SIZE, this.dir);
    }
};

const RAIN = {
    enabled: true,
    angleDeg: 20,
    speed: 820,
    speedVariance: 0.35,
    angleJitterDeg: 0,
    maxDropsPerLayer: 1600,
    splashColor: "#eaf8ff",

    layers: {
        back: {
            enabled: true,
            collide: false,
            parallax: 0.55,
            speedScale: 0.8,
            density: 40,
            pixelSize: PIXEL_SIZE,
            dropLength: 3,
            dropLengthVariance: 0.6,
            alphaScale: 0.7,
            color: "#3f5c78",
        },
        mid: {
            enabled: true,
            collide: true,
            parallax: 1,
            speedScale: 1,
            density: 20,
            pixelSize: PIXEL_SIZE,
            dropLength: 4,
            dropLengthVariance: 0.75,
            alphaScale: 1,
            color: "#bcdcff",
        },
        front: {
            enabled: true,
            collide: false,
            parallax: 1.45,
            speedScale: 1.25,
            density: 7,
            pixelSize: PIXEL_SIZE * 2,
            dropLength: 5,
            dropLengthVariance: 0.5,
            alphaScale: 1,
            color: "#eaf6ff",
        },
    },
};
window.RAIN = RAIN;

const RAIN_SOLID_TYPES = new Set(["block", "hazard", "portal", "tramp", "mud", "ice"]);

let rainLayers = {};
let rainSplashes = [];

function initRainLayers() {
    rainLayers = {};
    for (const key in RAIN.layers) {
        rainLayers[key] = { drops: [], spawnAccumulator: 0 };
    }
}

function blockAt(worldX, worldY) {
    const col = Math.floor(worldX / BLOCK_SIZE);
    const row = Math.floor(worldY / BLOCK_SIZE);
    return blockGrid.get(col + "," + row) || null;
}

class RainSplashParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 0;
        this.maxLife = 0.12 + Math.random() * 0.1;
    }
    update(dt) {
        this.life += dt;
        return this.life < this.maxLife;
    }
    draw() {
        const t = Funcs.constrain(1 - this.life / this.maxLife, 0, 1);
        graphics.ctx.globalAlpha = t * 0.85;
        graphics.ctx.fillStyle = this.color;
        const px = Math.round(this.x / PIXEL_SIZE) * PIXEL_SIZE;
        const py = Math.round(this.y / PIXEL_SIZE) * PIXEL_SIZE;
        graphics.ctx.fillRect(px, py, PIXEL_SIZE, PIXEL_SIZE);
    }
}

function spawnImpactSplash(x, y) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const offsetX = Math.round((Math.random() - 0.5) * 3) * PIXEL_SIZE;
        const offsetY = Math.round((Math.random() - 0.5) * 2) * PIXEL_SIZE;
        rainSplashes.push(new RainSplashParticle(x + offsetX, y + offsetY, RAIN.splashColor));
    }
}

class RainDrop {
    constructor(x, y, layer) {
        this.x = x;
        this.y = y;
        this.alive = true;
        this.layer = layer;

        const jitter = (Math.random() - 0.5) * 2 * RAIN.angleJitterDeg;
        const angleRad = (RAIN.angleDeg + jitter) * Math.PI / 180;
        const spd = RAIN.speed * layer.speedScale * (1 + (Math.random() - 0.5) * 2 * RAIN.speedVariance);
        this.vx = Math.sin(angleRad) * spd;
        this.vy = Math.cos(angleRad) * spd;
        this.alpha = (0.5 + Math.random() * 0.4) * layer.alphaScale;
        this.len = Math.max(1, Math.round(
            layer.dropLength * (1 + (Math.random() - 0.5) * 2 * layer.dropLengthVariance)
        ));
    }

    update(dt) {
        const nx = this.x + this.vx * dt;
        const ny = this.y + this.vy * dt;

        if (this.layer.collide) {
            if (nx >= player.x && nx <= player.x + player.w && ny >= player.y && ny <= player.y + player.h) {
                this.alive = false;
                spawnImpactSplash(nx, ny);
                return;
            }

            const hit = blockAt(nx, ny);
            if (hit) {
                if (hit.type === "water") {
                    const isSurface = hit.isTopSurface && hit.isTopSurface(blocks);
                    const surfaceLine = isSurface ? (Water.waterSurfaceLineAt(nx) ?? hit.y) : hit.y;

                    if (!isSurface || ny >= surfaceLine) {
                        this.alive = false;
                        const impact = Funcs.constrain(Math.abs(this.vy) * 0.12, 6, 42);
                        Water.splashWaterSurface(nx, impact);
                        if (Math.random() < 0.45) {
                            Water.spawnWaterLightDisturbance(nx, Funcs.constrain(impact * 0.5, 6, 24));
                        }
                        spawnImpactSplash(nx, surfaceLine);
                        return;
                    }
                } else if (RAIN_SOLID_TYPES.has(hit.type)) {
                    this.alive = false;
                    spawnImpactSplash(nx, Math.min(ny, hit.y));
                    return;
                }
            }
        }

        this.x = nx;
        this.y = ny;

        if (this.y > lvlSizeY + 900 || this.x < -1200 || this.x > lvlSizeX + 1200) {
            this.alive = false;
        }
    }

    draw() {
        const dirLen = Math.hypot(this.vx, this.vy) || 1;
        const ux = this.vx / dirLen;
        const uy = this.vy / dirLen;
        const size = this.layer.pixelSize;

        const factor = this.layer.parallax;
        const baseX = this.x + cam.x * (1 - factor);
        const baseY = this.y + cam.y * (1 - factor);

        graphics.ctx.globalAlpha = this.alpha;
        graphics.ctx.fillStyle = this.layer.color;
        for (let s = 0; s < this.len; s++) {
            const px = Math.round((baseX - ux * s * size) / PIXEL_SIZE) * PIXEL_SIZE;
            const py = Math.round((baseY - uy * s * size) / PIXEL_SIZE) * PIXEL_SIZE;
            graphics.ctx.fillRect(px, py, size, size);
        }
    }
}

function updateRainLayers(dt) {
    const angleRad = RAIN.angleDeg * Math.PI / 180;

    for (const key in RAIN.layers) {
        const layer = RAIN.layers[key];
        const state = rainLayers[key];
        if (!state) continue;

        if (!RAIN.enabled || !layer.enabled) {
            state.drops.length = 0;
            continue;
        }

        const factor = layer.parallax;
        const centerX = cam.x * factor;
        const centerY = cam.y * factor;

        const spawnMarginY = 160;
        const spawnY = centerY - graphics.height / 2 - spawnMarginY;
        const slant = Math.abs(Math.tan(angleRad)) * (graphics.height + spawnMarginY);
        const spawnLeft = centerX - graphics.width / 2 - slant - 80;
        const spawnRight = centerX + graphics.width / 2 + slant + 80;
        const spawnWidth = spawnRight - spawnLeft;

        state.spawnAccumulator += layer.density * (spawnWidth / 1000) * dt;
        while (state.spawnAccumulator >= 1 && state.drops.length < RAIN.maxDropsPerLayer) {
            state.spawnAccumulator -= 1;
            const x = spawnLeft + Math.random() * spawnWidth;
            const y = spawnY - Math.random() * 260;
            state.drops.push(new RainDrop(x, y, layer));
        }
    }

    for (const key in rainLayers) {
        const drops = rainLayers[key].drops;
        for (let i = drops.length - 1; i >= 0; i--) {
            drops[i].update(dt);
            if (!drops[i].alive) drops.splice(i, 1);
        }
    }
    for (let i = rainSplashes.length - 1; i >= 0; i--) {
        if (!rainSplashes[i].update(dt)) rainSplashes.splice(i, 1);
    }
}

function drawRainLayer(key) {
    const state = rainLayers[key];
    if (!state || state.drops.length === 0) {
        if (key !== "mid" || rainSplashes.length === 0) return;
    }
    graphics.ctx.save();
    graphics.ctx.imageSmoothingEnabled = false;
    if (state) {
        for (const drop of state.drops) drop.draw();
    }
    if (key === "mid") {
        for (const splash of rainSplashes) splash.draw();
    }
    graphics.ctx.globalAlpha = 1;
    graphics.ctx.restore();
}



async function toBitmap(dataUrl) {
    const bin = atob(dataUrl);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    const decoder = new ImageDecoder({ data: bytes.buffer, type: "image/png" });
    await decoder.tracks.ready;
    const frame = (await decoder.decode()).image;
    const bitmap = await createImageBitmap(frame);
    return bitmap;
}

graphics.ctx.drawImage(await toBitmap(texStr.img),0,0);
let texture = graphics.ctx.getImageData(0,0,600,600);
graphics.ctx.fillRect(0,0,600,600);
graphics.ctx.imageSmoothingEnabled = false;



const scarf = new Fabric({
    x: player.x,
    y: player.y + 50,
    cols: 5,
    rows: 9,
    spacing: 5,
    lockedTop: false,
    stiffness: 0.8,
    shapeMap: [
        '1111111111111',
        '1111111111   ',
        '111111111    ',
        '11111111     ',
        '11111111     ',
        '11111111     ',
        '11111111     ',
        '11111111     ',
        
    ]
})

scarf.init();

for (let x = 0; x < scarf.cols; x++) {
    let point = scarf.points[x];

    point.parent = player;

    point.offsetX = x * scarf.spacing - 7;
    point.offsetY = 30;
}







let grid = null;
let levelArray = null;
let camera = null;
let lighting = null;


//const worldBounds = new Bounds(0, 0, width, height);

// Probably should go in lighting.js, but too many dependencies to move it right now
function updateAndRenderLighting(lighting) {
    for (let {
            x,
            y
        }
        of lighting.grid.visitCells(camera)) {
        const symbol = levelArray.get(x, y);
        graphics.ctx.fillStyle = `rgba(0, 0, 0, ${ 1- lighting.getLightLevel(x, y, symbol, player, levelArray)})`;

        graphics.ctx.fillRect(lighting.grid.cellToWorld(x), lighting.grid.cellToWorld(y), lighting.grid.size, lighting.grid.size);
    }
}

let lvlSizeX = 0;
let lvlSizeY = 0;

function mapSetup(LEVEL) {
    blocks = [];
    
    //let MAP = LEVEL;
    let longestX = 0;
    
    //create blocks and player
    for (let i = 0; i < MAP[LEVEL].length; i++) {
        for (let j = 0; j < MAP[LEVEL][i].length; j++) {
            const sym = MAP[LEVEL][i][j];
            switch (sym) {
                case "#":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "block"));
                    break;
                case "!":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "hazard"));
                    break;
                case "%":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "portal"));
                    break;
                case "$":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "tramp"));
                    break;
                case "_":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "mud"));
                    break;
                case "&":
                    blocks.push(new Block(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, "ice"));
                    break;
                case "W":
                    blocks.push(new WaterBlock(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE));
                    break;
                case "F": {
                    let runEnd = j;
                    while (MAP[LEVEL][i][runEnd + 1] === "F") {
                        runEnd++;
                    }
                    blocks.push(new FireBlock(j * BLOCK_SIZE, i * BLOCK_SIZE, BLOCK_SIZE * (runEnd - j + 1), BLOCK_SIZE));
                    j = runEnd;
                    break;
                }
                case "@":
                    player.x = j * BLOCK_SIZE;
                    player.y = i * BLOCK_SIZE;
                    break;
            }
            if (player.health <= 0 && MAP[LEVEL] && MAP[LEVEL][i] && MAP[LEVEL][i][j] === "@") {
                player.x = j * BLOCK_SIZE;
                player.y = i * BLOCK_SIZE;
                player.health = 10;
            }
        }
        
        if(MAP[LEVEL][i].length > longestX){
            longestX = MAP[LEVEL][i].length;
        }
    }
    
    blockGrid = new Map();
    for (const block of blocks) {
        const colStart = Math.round(block.x / BLOCK_SIZE);
        const colEnd = Math.round((block.x + block.w) / BLOCK_SIZE) - 1;
        const row = Math.round(block.y / BLOCK_SIZE);
        for (let col = colStart; col <= colEnd; col++) {
            blockGrid.set(col + "," + row, block);
        }
    }
    initRainLayers();
    rainSplashes = [];
    
    
    //fetch the width and height of each level in pixels
    lvlSizeX = longestX * BLOCK_SIZE;
    lvlSizeY = MAP[LEVEL].length * BLOCK_SIZE;

    //record the topmost water tile's y for each column, so the light beams know how deep they are and can fade out accordingly.

    // QC: I commented some stuff in here because importing makes them read only
    // Might be best to create a water handler class

    // Water.waterSurfaceByColumn = {};
    for (const block of blocks) {
        if (block.type !== "water") continue;
        if ( Water.waterSurfaceByColumn[block.x] === undefined || block.y <  Water.waterSurfaceByColumn[block.x]) {
             Water.waterSurfaceByColumn[block.x] = block.y;
        }
    }
    Water.buildWaterSurfaceSegments();
   // waterLightDisturbances = [];


    Water.lightStreaksWide.push(...Water.createLightStreaks(lvlSizeX, {
        minWidth: 18, maxWidth: 65,
        minGap: 10, maxGap: 95,
        minOpacity: 0.16, maxOpacity: 0.55,
        swayAmp: 20,
        tilt: WATER_TILT_PER_ROW,
        palette: ["#3f96da", "#4fc3ff", "#63cdff", "#7fd6ee"],
    }));
    Water.lightStreaksFine.push(...Water.createLightStreaks(lvlSizeX, {
        minWidth: 6, maxWidth: 20,
        minGap: 15, maxGap: 110,
        minOpacity: 0.3, maxOpacity: 0.95,
        swayAmp: 12,
        tilt: WATER_TILT_PER_ROW,
        palette: ["#bff2ff", "#e2fbff", "#9fe6ff", "#d0f6ff"],
    }));
    
    //alert(lvlSizeX)
    //lighting setup
    grid = new Grid();
    grid.setSize(BLOCK_SIZE);
    levelArray = Raster.fromBitmap(MAP[LEVEL]);
    camera = new Bounds(-graphics.width, -graphics.height, lvlSizeX + graphics.width + graphics.width/2, lvlSizeY + graphics.height + graphics.height/2);
    lighting = new Lighting(grid, {
        "!": {
            emission: 1,
        },
        "%": {
            emission: 1,
        },
        "#": {
            isSolid: true,
        },
    }, {
        airDecay: 0.9,
        groundDecay: 0.7,
        minLevel: 0.08,
        playerLightRadius: 5,
        playerLightStrength: 0.95,
    });
    
}

//camera shake
const shakes = []; 
let shake = {
    x: 0,
    y: 0,
};
const Shake = (function () {
    let Shake = function (n) {
        //shake power
        this.n = n;
    };
    Shake.prototype = {
        active: function(increment){
            //apply shake
            shake.x = (Math.random()*2-1)*this.n;
            shake.y = (Math.random()*2-1)*this.n;
            
            //fade the shake
            this.n -= 0.5;
            
            if (this.n < 0) {
                shake.x = 0;
                shake.y = 0;
                shakes.splice(increment, 1);
            }
        }
    };
    return Shake;
})();

/* Camera object */
const cam = {
    x: player.x,
    y: player.y,
    z: 1,
    update() {
        this.x = Funcs.lerp(this.x, player.x * this.z, 0.1);
        this.y = Funcs.lerp(this.y, player.y * this.z, 0.1);
        graphics.ctx.translate(~~(-this.x + shake.x + graphics.width / 2 ), ~~(-this.y + shake.y + graphics.height / 2));
        graphics.ctx.scale(this.z, this.z);
    },
};

let freeze = false;
let timer = 0;
    
/* Run key functions */
function app() {
    if (player.y > (lvlSizeY + 40)) {
        player.health--;
    }
    if(player.x > lvlSizeX + 40){
        player.health--; 
    }
    if(player.y < (0 - 200)){
        player.health--;
    }
    if(player.x < (0 - 40)){
        player.health--;
    }
    
    if (player.health <= 0) {
        timer++;
        
        if(timer > 25){
            
            player.acceleration = 600;
            player.gravity = 600;
            
            mapSetup(currentLevel - 1);
            timer = 0;
        }
        else {
            
            player.v.x = 0;
            player.v.y = 0;
            player.acceleration = 0;
            player.gravity = 0;
        }
    }
    if (nxt) {
        mapSetup(currentLevel);
        currentLevel++;
        player.health = 10;
        nxt = false;
        localStorage.setItem("storedLevel", currentLevel);
    }
}

/* main render loop */
const render = (timestamp) => {
    
    //prefer the rAF timestamp when present
    const now = (typeof timestamp === 'number') ? timestamp : performance.now();
    
    //dt in milliseconds, never negative
    dtMs = Math.max(0, now - lastTime);
    lastTime = now;
    
    //dt in seconds (clamped to avoid huge jumps after tab hidden)
    dt = (Math.min(dtMs / 1000, 0.1));
    fps = dtMs > 0 ? Math.round(1000 / dtMs) : fps;
    
    //advance the water ripple animation clock
    frameTime = now;
    
    drawBackgroundArt();
    
    //ctx.fillRect(0, 0, lvlSizeX, lvlSizeY);
    
    
    //ctx.fillStyle = 'rgb(25, 35, 35)';
    //ctx.fillRect(0, 0, lvlSizeX/2, lvlSizeY);
    
    app();
    graphics.ctx.save();
    
    player.inWater = false;
    const playerCenterX = player.x + player.w / 2;
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.type !== "water" || !Funcs.edgeCheck(player, block)) continue;
        if (block.isTopSurface && block.isTopSurface(blocks)) {
            const surfaceLine = Water.waterSurfaceLineAt(playerCenterX);
            if (surfaceLine !== null && player.y + player.h < surfaceLine) {
                continue;
            }
        }
        player.inWater = true;
        break;
    }

    Water.updateWaterSurfaceSegments(dt);
    Water.updateWaterLightDisturbances(dt);
    Water.updatePlayerWaterSpring(dt);

    player.moveX();
    
    for(let i in blocks){
        const block = blocks[i];
        if (block.type === "water") continue;
        let col = player.collideX(block);
        //only collide with one block a frame
        if(col){
            break;
        }
    }
    
    
    //vertical collisions and player movement
    player.moveY();
    
    for(let i in blocks){
        const block = blocks[i];
        if (block.type === "water") continue;
        let col = player.collideY(block);
        //only collide with one block a frame
        if(col){
            break;
        }
    }
    

            
    //cam shake loop
    for(let s in shakes){
        shakes[s].active(s);
    }

    cam.update();
    updateRainLayers(dt);
    drawRainLayer("back");

    for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type !== "water" && blocks[i].type !== "fire") {
            blocks[i].draw();
        }
    }

    // Draw fabric
    // Uncomment these if you want it active
    scarf.update()
    rasterizer.raster();

    player.display();
    drawRainLayer("mid");

    //Draw water on top of the player so it looks like they are submerged.
    for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type === "water") {
            blocks[i].draw(blocks);
        }
    }

    applyUnderwaterDistortion();

    updateAndRenderLighting(lighting);
    drawRainLayer("front");

    for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type === "fire") {
            blocks[i].update(texture);
            blocks[i].draw();
        }
    }

    if(currentLevel === MAP.length){
        shakes.push(new Shake(100));
        document.getElementById("game").style.display = "none";
        const sax = document.getElementById("img").style;
        sax.display = "block";
        sax.top = '40px';
        sax.left = `${250 + shake.x}px`;
        sax.transform = `rotate(${shake.x}deg)`;
        sax.width = "40%";
        
    }
    
    // graphics.ctx.strokeStyle = "red";
    // graphics.ctx.strokeRect(0, 0, lvlSizeX, lvlSizeY);
    
    

    
    
    graphics.ctx.restore();
    
    if(player.health < 0 && timer < 25){
        graphics.ctx.fillStyle = "rgba(55, 56, 55, 0.1)";
        let t = 0;
        t = Funcs.lerp(t, timer * 3, 0.8);
        graphics.ctx.strokeStyle = "white";
        graphics.ctx.save();
            let x = 0 + t;
            let y = 0 + t;
            //ctx.translate(x / 2, y / 2);
            graphics.ctx.strokeRect(x,y, 600 - t - t, 600 - t - t);
            graphics.ctx.fillRect(x, y, 600 - t - t, 600 - t - t)
        graphics.ctx.restore();
        
    }
    
    if(!freeze){
        //window.requestAnimationFrame(loop);
    }
};

/* Initialize first map and start loop */
mapSetup(currentLevel);

let rafId = null;
let running = true;

//pause when tab hidden to avoid wasted frames
document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running && rafId === null) {
        rafId = requestAnimationFrame(loop);
    }
    if (!running && rafId !== null) { 
        cancelAnimationFrame(rafId); 
        rafId = null; 
    }
});

function loop(now) {
    //if(!debug.freeze){
        if (!running) { 
            rafId = null; return; 
        }
        render(now);
        rafId = requestAnimationFrame(loop);
    //}
    //console.info(debug.freeze);
}

// start
if (rafId) cancelAnimationFrame(rafId);
rafId = requestAnimationFrame(loop);



