/**
 * Main lighting stuff
 */

import { Raster } from '../utils/dataStructures.js'
import { Funcs } from '../utils/funcs.js'

//calculates light propagation across a grid based on cell types and decay settings
export class Lighting {
	//stores calculated light intensity per cell
	data = new Raster();

	constructor(grid, settings) {
		//reference to the grid scale
		this.grid = grid;
		//configuration for light decay and minimum levels
		this.settings = settings;
		this.playerLightRadius = settings.playerLightRadius ?? 4;
		this.playerLightStrength = settings.playerLightStrength ?? 0.95;
		//how quickly cells update to new light values (0 = no change, 1 = instant)
		this.smoothing = settings.lightSmooth ?? 0.14;

		this.neighborDirections = [
			[-1,  0],
			[ 1,  0],
			[ 0, -1],
			[ 0,  1],
		];
	}

	//Calculates a cell's light level by diffusing light from neighbors and applying decay
	getLightLevel(x, y, player, level) {
		const targetBlock = level.blockAtNormalizedScale(x, y);
		const targetIsSolid = targetBlock?.isSolid ?? false;
		const targetEmissivity = targetBlock?.emissivity ?? 0;

		let highestNeighbor = 0;
		for (const [ndx, ndy] of this.neighborDirections) {
			const nx = x + ndx, ny = y + ndy;
			//light only reaches a cell by traveling through open space
			if (!targetIsSolid && level.blockAtNormalizedScale(nx, ny)?.isSolid) {
				continue;
			}
			const lightLevel = this.data.get(nx, ny);
			if (lightLevel !== null && lightLevel > highestNeighbor) {
				highestNeighbor = lightLevel;
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

		const target = Math.max(propagatedLight, playerLight, targetEmissivity);
		const previous = this.data.get(x, y) ?? target;
		const smoothed = Funcs.lerp(previous, target, this.smoothing);
		this.data.set(x, y, smoothed);
		return smoothed;
	}

}