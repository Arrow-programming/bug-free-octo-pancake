/**
 * Player code
 * _Not used right now due to dependencies_
 */


import { BLOCK_SIZE, PIXEL_SIZE } from '../utils/constants.js'
import { Funcs } from '../utils/funcs.js'
import { keys } from '../utils/input.js';
import { gfx } from "../../assets/art/pixelart.js";
import { graphics } from '../graphics.js'



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
    
    moveX: function(dt){
        this.inputs.left = (keys[37] || keys[65]);
        this.inputs.right = (keys[39] || keys[68]);
        
        if (this.inWater) {
            const centerX = this.x + this.w / 2;
            const surfaceLine = waterSurfaceLineAt(centerX);
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
    moveY: function(dt){
        this.inputs.up = (keys[38] || keys[87]);
        this.inputs.down = (keys[40] || keys[83]);

        if (this.inWater) {
            const centerX = this.x + this.w / 2;
            const surfaceLine = waterSurfaceLineAt(centerX);
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
    display: function(dt, playerSprites) {
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