import { SLIP, VELOCITY, JUMP } from "../utils/constants.js";

// analogous to states of matter
/**
 * @enum { BlockState }
 */
export const BlockState = {
    NULL: 0,
    SOLID: 1,
    LIQUID: 2,
    stringRepresentation(state) {
		switch (state) {
			case this.NULL: return "BlockState.NULL";
			case this.SOLID: return "BlockState.SOLID";
			case this.LIQUID: return "BlockState.LIQUID";
			default: console.error(`error: unknown BlockState ${side}`); return null;
		}
	},
};

export class BlockType {
    #descriptor;

    /** Standard descriptor properties:
     * name
     * state
     * emissivity?
     * slip?
     * velocity?
     * initialize(block, initializer)?
     * draw(block, blocks)
     * update(block, dt)?
     * 
     * @param {*} descriptor 
     */
    constructor(descriptor) {
        if (typeof descriptor.state === "undefined") console.error("No state attribute provided for block type.");

        const requiresSVJ = descriptor.state == BlockState.SOLID || descriptor.state == BlockState.LIQUID;

        if (requiresSVJ && typeof descriptor.slip === "undefined") console.error("No slip attribute provided for block type.");
        if (requiresSVJ && typeof descriptor.velocity === "undefined") console.error("No velocity attribute provided for block type.");
        if (requiresSVJ && typeof descriptor.jump === "undefined") console.error("No jump attribute provided for block type.");
        if (typeof descriptor.draw === "undefined") console.error("No draw method provided for block type.");
        if (typeof descriptor.name === "undefined") console.error("No name attribute provided for block type.");
        this.#descriptor = descriptor;
        this.#descriptor.emissivity ??= 0;
        this.#descriptor.slip ??= SLIP;
        this.#descriptor.velocity ??= VELOCITY;
        this.#descriptor.jump ??= JUMP;
    }

    get name() { return this.#descriptor.name; }
    get state() { return this.#descriptor.state; }
    get emissivity() { return this.#descriptor.emissivity; }
    get slip() { return this.#descriptor.slip; }
    get velocity() { return this.#descriptor.velocity; }
    get jump() { return this.#descriptor.jump; }

    initialize(block, initializer) {
        if (this.#descriptor.initialize) this.#descriptor.initialize.call(this.#descriptor, block, initializer);
    }

    draw(block, blocks) {
        this.#descriptor.draw.call(this.#descriptor, block, blocks);
    }

    update(block, dt) {
        if (this.#descriptor.update) this.#descriptor.update.call(this.#descriptor, block, dt);
    }
}