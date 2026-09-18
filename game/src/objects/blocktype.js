

export class BlockType {
    #descriptor;

    /** Standard descriptor properties:
     * name
     * isSolid
     * emissivity?
     * initialize(block, initializer)?
     * draw(block, blocks)
     * update(block, dt)?
     * 
     * @param {*} descriptor 
     */
    constructor(descriptor) {
        if (typeof descriptor.isSolid === "undefined") console.error("No isSolid attribute provided for block type.");
        if (typeof descriptor.draw === "undefined") console.error("No draw method provided for block type.");
        if (typeof descriptor.name === "undefined") console.error("No name attribute provided for block type.");
        this.#descriptor = descriptor;
        this.#descriptor.emissivity ??= 0;
    }

    get name() { return this.#descriptor.name; }
    get isSolid() { return this.#descriptor.isSolid; }
    get emissivity() { return this.#descriptor.emissivity; }

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