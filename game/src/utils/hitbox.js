import { Funcs } from './funcs.js'

/**
 * @enum {number}
 */
export const HitboxSide = {
	U: 0,
	L: 1,
	D: 2,
	R: 3,
	stringRepresentation(side) {
		switch (side) {
			case this.U: return "HitboxSide.U";
			case this.L: return "HitboxSide.L";
			case this.D: return "HitboxSide.D";
			case this.R: return "HitboxSide.R";
			default: console.error(`error: unknown HitboxSide ${side}`); return null;
		}
	},
};

export class Hitbox {
    x1; y1; x2; y2;

    /**
     * 
     * @overload
     * @param {number} x1 
     * @param {number} y1 
     * @param {number} x2 
     * @param {number} y2 
     */

    /**
     * 
     * @param {Hitbox} hbox
     */
    constructor(x1, y1, x2, y2) {
        this.set(x1, y1, x2, y2);
    }

    /**
     * 
     * @param {number} x 
     * @param {number} y 
     * @param {number} w 
     * @param {number} h 
     */
    static fromSize(x, y, w, h) {
        return new Hitbox(x, y, x + w, y + h);
    }

    /**
     * 
     * @overload
     * @param {number} x1 
     * @param {number} y1 
     * @param {number} x2 
     * @param {number} y2 
     */

    /**
     * 
     * @param {Hitbox} hbox
     */
    set(x1, y1, x2, y2) {
        if (typeof y1 === "undefined") {
            const hbox = x1;
            this.x1 = hbox.x1; this.y1 = hbox.y1;
            this.x2 = hbox.x2; this.y2 = hbox.y2;
        } else {
            this.x1 = x1; this.y1 = y1;
            this.x2 = x2; this.y2 = y2;
        }
    }

    /**
     * 
     * @param {number} x 
     * @param {number} y 
     * @param {number} w 
     * @param {number} h 
     */
    setWH(x, y, w, h) {
        this.x1 = x; this.y1 = y;
        this.x2 = x + w; this.y2 = y + h;
    }

    get w() { return this.x2 - this.x1; }
    set w(nw) { this.x2 = this.x1 + nw; }

    get h() { return this.y2 - this.y1; }
    set h(nh) { this.y2 = this.y1 + nh; }

    /**
     * 
     * @param {Hitbox} a 
     * @param {Hitbox} b 
     * @param {number} [hboxExpand = 0]
     * @returns {boolean}
     */
    static staticCollision(a, b, hboxExpand = 0) {
        return (
            a.x2 + hboxExpand >= b.x1 &&
            a.x1 - hboxExpand <= b.x2 &&
            a.y2 + hboxExpand >= b.y1 &&
            a.y1 - hboxExpand <= b.y2
        );
    }

    /** outObject.side is which direction object A collided with object B (U, L, D, R)
     * if outObject.side is R, for example, that means object A collided with the right side of object B
     * 
     * @param {Hitbox} pa Past hitbox of object A
     * @param {Hitbox} na Now  hitbox of object A
     * @param {Hitbox} pb Past hitbox of object B
     * @param {Hitbox} nb Now  hitbox of object B
     * @param {{ minimumTime: number, collisionSide: HitboxSide }} outObject 
     */
    static sweepCollision(pa, na, pb, nb, outObject) {
        // Adapted by xyzyyxx from xyzyyxx's platformer engine

        // where along the "sweep" of object 1 does it intersect the "sweep" of object 2?
        // it evaluates for all four sides of the rect
        // this is needed for moving blocks
        // moving blocks are a pain -xyzyyxx

        // Object A to the right
        let rt = Funcs.sweepT(pa.x1, na.x1, pb.x2, nb.x2);

        // down
        let dt = Funcs.sweepT(pa.y1, na.y1, pb.y2, nb.y2);

        // left
        let lt = Funcs.sweepT(pa.x2, na.x2, pb.x1, nb.x1);

        // up
        let ut = Funcs.sweepT(pa.y2, na.y2, pb.y1, nb.y1);

        // discard invalids (out of edge, negative)
        // these describe the position of the hitboxes at the time of the candidate collision
        // r/u/l/d == at the time of the candidate collision in this direction, o1/o2 == object 1 or 2, x1/y1/x2/y2
        let ro1y1 = Funcs.lerp(pa.y1, na.y1, rt);
        let ro1y2 = Funcs.lerp(pa.y2, na.y2, rt);
        let ro2y1 = Funcs.lerp(pb.y1, nb.y1, rt);
        let ro2y2 = Funcs.lerp(pb.y2, nb.y2, rt);
        if (rt < 0 || ro1y1 > ro2y2 || ro1y2 < ro2y1) {
            rt = Infinity;
        }

        let do1x1 = Funcs.lerp(pa.x1, na.x1, dt);
        let do1x2 = Funcs.lerp(pa.x2, na.x2, dt);
        let do2x1 = Funcs.lerp(pb.x1, nb.x1, dt);
        let do2x2 = Funcs.lerp(pb.x2, nb.x2, dt);
        if (dt < 0 || do1x1 > do2x2 || do1x2 < do2x1) {
            dt = Infinity;
        }

        // [AI generated block; too lazy to type the rest out manually lol]
        let lo1y1 = Funcs.lerp(pa.y1, na.y1, lt);
        let lo1y2 = Funcs.lerp(pa.y2, na.y2, lt);
        let lo2y1 = Funcs.lerp(pb.y1, nb.y1, lt);
        let lo2y2 = Funcs.lerp(pb.y2, nb.y2, lt);
        if (lt < 0 || lo1y1 > lo2y2 || lo1y2 < lo2y1) {
            lt = Infinity;
        }

        let uo1x1 = Funcs.lerp(pa.x1, na.x1, ut);
        let uo1x2 = Funcs.lerp(pa.x2, na.x2, ut);
        let uo2x1 = Funcs.lerp(pb.x1, nb.x1, ut);
        let uo2x2 = Funcs.lerp(pb.x2, nb.x2, ut);
        if (ut < 0 || uo1x1 > uo2x2 || uo1x2 < uo2x1) {
            ut = Infinity;
        }
        // [End AI generated block]

        // take the minimum (first edge the sweep collides with)
        let mt = rt;
        let side = HitboxSide.R;

        if (lt < mt) { mt = lt; side = HitboxSide.L; }
        if (dt < mt) { mt = dt; side = HitboxSide.D; }
        if (ut < mt) { mt = ut; side = HitboxSide.U; }

        // return data
        outObject.minimumTime = mt;
        outObject.collisionSide = side;
    }
};