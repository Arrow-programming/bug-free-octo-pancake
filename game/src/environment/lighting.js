/**
 * Main lighting stuff
 */

import { Raster } from '../utils/dataStructures.js'
import { Funcs } from '../utils/funcs.js'

//calculates light propagation across a grid based on cell types and decay settings
export class Lighting {
    //stores calculated light intensity per cell
    data = new Raster();

    constructor(grid, palette, settings) {
        //reference to the grid scale
        this.grid = grid;
        //mapping of symbols to properties like solidity and emission
        this.palette = palette;
        //configuration for light decay and minimum levels
        this.settings = settings;
        this.playerLightRadius = settings.playerLightRadius ?? 4;
        this.playerLightStrength = settings.playerLightStrength ?? 0.95;
        //how quickly cells update to new light values (0 = no change, 1 = instant)
        this.smoothing = settings.lightSmooth ?? 0.14;
    }

    //Checks if a cell blocks light
    isSolid(symbol) {
        return !!(this.palette[symbol]?.isSolid);
    }

    //Gets base brightness of a cell
    getEmission(symbol) {
        return this.palette[symbol]?.emission ?? 0;
    }

    //Calculates a cell's light level by diffusing light from neighbors and applying decay
    getLightLevel(x, y, symbol, player, levelArray) {
        const targetIsSolid = this.isSolid(symbol);
        const neighborCoords = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
        ];

        let highestNeighbor = 0;
        for (const [nx, ny] of neighborCoords) {
            //light only reaches a cell by traveling through open space
            if (!targetIsSolid && this.isSolid(levelArray?.get(nx, ny))) {
                continue;
            }
            const level = this.data.get(nx, ny);
            if (level !== null && level > highestNeighbor) {
                highestNeighbor = level;
            }
        }

        //apply different decay rates depending on whether the light is passing through a solid or air
        const propagatedLight = Math.max(highestNeighbor * (targetIsSolid ? this.settings.groundDecay : this.settings.airDecay), this.settings.minLevel);

        const playerCellX = Math.floor(player.x / this.grid.size);
        const playerCellY = Math.floor(player.y / this.grid.size);
        const dx = Math.abs(x - playerCellX);
        const dy = Math.abs(y - playerCellY);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const playerLight = distance <= this.playerLightRadius
            ? Math.max(this.settings.minLevel, this.playerLightStrength * (1 - distance / this.playerLightRadius))
            : 0;

        const emission = this.getEmission(symbol);
        const target = Math.max(propagatedLight, playerLight, emission);
        const previous = this.data.get(x, y) ?? target;
        const smoothed = Funcs.lerp(previous, target, this.smoothing);
        this.data.set(x, y, smoothed);
        return smoothed;
    }

}