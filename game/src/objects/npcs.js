import { graphics } from '../graphics.js'

export const NPCTypes = {
    moth: {
        name: 'moth',
        isSolid: false,
        w: 20,
        h: 20,
        avoidance: {
            rad: 40,
            force: 200
        },
        move: function(npc, dt) {
            
        },
        draw: function(npc) {
            graphics.ctx.fillStyle = 'rgb(200, 200, 100)';
            graphics.ctx.fillRect(npc.x, npc.y, this.w, this.h);
        }
    },
    bird: {
        isSolid: false,
        w: 30,
        h: 15,
        avoidance: {
            rad: 40,
            force: 70
        },
        move: function(npc, dt) {
           
        }
    }
}

export class NPCSystem {
    constructor() {
        this.npcs = [];
    }

    add(npc) {
        this.npcs.push(npc);
    }

    remove(npc) {
        const ind = this.npcs.indexOf(npc);

        if(ind !== -1) {
            this.npcs.splice(ind, 1);
        }
    }

    getNearby(pos, radius, type=null) {
        const result = [];

        for (const n of this.npcs) {
            if (type != null && n.type !== type) {
                continue;
            }

            const dx = n.x - pos.x;
            const dy = n.y - pos.y;

            if(dx * dx + dy * dy <= radius * radius) {
                result.push(n);
            }
        }

        return result;
    }

    getByType(type) {
        return this.npcs.filter(npc => npc.type === type);
    }

    update(objects, dt) {
        for(let npc of this.npcs) {
            npc.update(objects, dt);
        }
    }

    draw() {
        for(let npc of this.npcs) {
            npc.draw();
        }
    }

    get size() {
        return this.npcs.length;
    }
}

export class NPC {
    constructor({x, y, type} = {}) {
        this.x = x;
        this.y = y;
        this.w = NPCTypes[type]?.w ?? 30;
        this.h = NPCTypes[type]?.h ?? 30;

        this.vx = 0;
        this.vy = 0;
        this.ax = 0;
        this.ay = 0;

        this.state = 'idle';
        this.target = null;
        this.dead = false;

        this.type = type;
    }

    avoid(objects) {
        const rad = this.type.avoidance.rad
        const force = this.type.avoidance.force;

        for (const obj of objects) {
            let dx = this.x - obj.x;
            let dy = this.y - obj.y;

            let dist = Math.hypot(dx, dy);
            let minDist = rad + Math.max(this.w, this.h) / 2 + Math.max(obj.w, obj.h) / 2;

            if (dist > minDist || dist === 0) {
                continue;
            }

            let nx = dx / dist;
            let ny = dy / dist;

            const strength = (1 - dist / minDist) * force;

            this.ax += nx * strength;
            this.ay += ny * strength;
        }
    }

    draw() {
        this.type.draw(this);
    }

    update(objects, dt) {
        this.ax = 0;
        this.ay = 0;

        this.avoid(objects);

        this.vx += this.ax * dt;
        this.vy += this.ay * dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

       

        this.type.move(this, dt);
    }
}