import { BLOCK_SIZE } from './utils/constants.js';
import { Bounds, Grid, Raster } from './utils/dataStructures.js';
import { Block } from './objects/blocks.js';
import { BlockTypes } from './objects/typedecls.js';
import { NPC, NPCTypes } from './objects/npcs.js';
import { Lighting } from './environment/lighting.js';
import * as Water from './environment/water.js';

export const LEVEL_RAIN_INTENSITIES = ['medium'];

export const LEVELS = [
	[
		'                &&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&_________________________#####################&&&&&&&&&&&&&&&&&&&&&',
		'              __    !', '          #     ', '          #      !!', ' FFFFF    #FFF  ',
		'######    ####   ', '        @#  %##  ', ' F       ######   ', ' #WWWWWW##  !!# #####',
		'   #WWWWWW##     ', '  ##WWWWW#####   ', '  ####WWWWW#####F', '      #WWWWWWWW########',
		'      #WWWWWWWWWW######', '########WWWWWWWWWW#######', '####WWWWWWWWWWWWWWWWW#######',
		'##WWWWWWWWWWWWWWWWWWWWW#######', '#######WWWWWWWWWWWWWWW######', '#######################', '',
	],
	['     ', ' #   #', '#   !#', '     #!', '#        ', '#@         ', '####&&!# %', '#############'],
	[' ', ' #', ' #', ' # @#', ' ###', ' ! !##', '   ', ' #  ', ' #%###'],
	['#################', '    #######', ' #####!', '###       ', '#!       !   !', '#     @  !   !', '       #########', ' #######%', '####   #', '!#      w#######'],
	['', '', '', '        #      #      #', '@  #    !      !      %', '#  !', '!'],
	['  ##!', '  !###', ' ## ###', ' #! #!', '  # ##@', '  % ####       %', '    ############'],
];

export const TILE_SYMBOLS = Object.freeze({ '#': BlockTypes.block, '!': BlockTypes.hazard, '%': BlockTypes.portal, '$': BlockTypes.tramp, '_': BlockTypes.mud, '&': BlockTypes.ice, W: BlockTypes.water, F: BlockTypes.fire });
export const TILE_NAMES = Object.freeze({ ' ': 'empty', '#': 'block', '!': 'hazard', '%': 'portal', '$': 'tramp', '_': 'mud', '&': 'ice', W: 'water', F: 'fire' });
export const DEFAULT_WORLD = Object.freeze({ version: 1, chunkSize: 16, loadRadius: 2, sectionGap: 0, sections: LEVELS });

function normalizeWorld(world) {
	const sections = world?.sections ?? LEVELS;
	return { ...DEFAULT_WORLD, ...world, chunkSize: Math.max(4, Math.floor(world?.chunkSize ?? 16)), loadRadius: Math.max(1, Math.floor(world?.loadRadius ?? 2)), sectionGap: 0, map: Array.isArray(world?.map) ? world.map.map(row => String(row ?? '')) : undefined, sections: sections.map(section => Array.isArray(section) ? section.map(row => String(row ?? '')) : []) };
}

function flattenSections(world) {
	if (Array.isArray(world.map)) {
		const rows = world.map.map(row => String(row ?? ''));
		const height = Math.max(1, rows.length);
		const width = Math.max(1, ...rows.map(row => row.length));
		const spawns = [];
		for (let y = 0; y < rows.length; y++) {
			const x = rows[y].indexOf('@');
			if (x !== -1) spawns.push({ x: x * BLOCK_SIZE, y: y * BLOCK_SIZE });
		}
		return { rows, width, height, spawns };
	}
	const height = Math.max(1, ...world.sections.map(section => section.length));
	const rows = Array.from({ length: height }, () => '');
	const spawns = [];
	let offset = 0;
	for (let sectionIndex = 0; sectionIndex < world.sections.length; sectionIndex++) {
		const section = world.sections[sectionIndex];
		const width = Math.max(1, ...section.map(row => row.length));
		for (let y = 0; y < height; y++) rows[y] += (section[y] ?? '').padEnd(width, ' ');
		for (let y = 0; y < section.length; y++) {
			const x = section[y].indexOf('@');
			if (x !== -1) spawns.push({ x: (offset + x) * BLOCK_SIZE, y: y * BLOCK_SIZE });
		}
		offset += width;
		if (sectionIndex < world.sections.length - 1) {
			for (let y = 0; y < height; y++) rows[y] += ' '.repeat(world.sectionGap);
			offset += world.sectionGap;
		}
	}
	return { rows, width: offset - world.sectionGap, height, spawns };
}

export class LevelHandler {
	constructor({ player, camera, npcs, onResetRain } = {}) {
		this.player = player; this.camera = camera; this.npcs = npcs; this.onResetRain = onResetRain ?? (() => {});
		this.world = normalizeWorld(DEFAULT_WORLD); this.loadedChunks = new Map(); this.blockByCell = new Map(); this.blocks = []; this.blockGrid = [];
		this.mapWidth = 0; this.current = 0; this.width = 0; this.height = 0; this.grid = null; this.levelArray = null; this.lighting = null; this.cameraBounds = null;
		this.chunkSize = this.world.chunkSize; this.loadRadius = this.world.loadRadius; this.spawn = { x: 300, y: 300 };
	}

	async load(url = './world.json') {
		try { const response = await fetch(url, { cache: 'no-store' }); if (response.ok) this.world = normalizeWorld(await response.json()); }
		catch (error) { console.warn('Using embedded world data:', error.message); }
		return this.world;
	}

	setup({ preservePlayer = false } = {}) {
		this.world = { ...this.world, sectionGap: 0 };
		this.player.wasInWater = false;
		const previousPlayer = preservePlayer ? {
			x: this.player.x, y: this.player.y, xv: this.player.xv, yv: this.player.yv,
			health: this.player.health, pastSlip: this.player.pastSlip, pastVel: this.player.pastVel,
			pastJump: this.player.pastJump,
		} : null;
		const flat = flattenSections(this.world); this.mapRows = flat.rows; this.world.map = this.mapRows; this.mapWidth = flat.width; this.width = flat.width * BLOCK_SIZE; this.height = flat.height * BLOCK_SIZE;
		this.spawn = flat.spawns[0] ?? { x: 300, y: 300 }; this.player.reset(this.spawn.x, this.spawn.y); this.loadedChunks.clear(); this.blockByCell.clear(); this.blocks.length = 0; this.blockGrid.length = 0;
		if (previousPlayer) {
			Object.assign(this.player, previousPlayer);
			this.player.generateHitbox();
			this.player.pbox.set(this.player.hbox);
		}
		this.chunkSize = this.world.chunkSize; this.loadRadius = this.world.loadRadius; this.grid = new Grid(); this.grid.setSize(BLOCK_SIZE); this.levelArray = Raster.fromBitmap(this.mapRows); this.cameraBounds = new Bounds(0, 0, this.width, this.height);
		this.lighting = new Lighting(this.grid, { airDecay: 0.9, groundDecay: 0.7, minLevel: 0.08, playerLightRadius: 5, playerLightStrength: 0.95 }); this.updateStreaming(true); this.refreshWater(); this.onResetRain(0);
		if (!preservePlayer) this.npcs?.add(new NPC({ x: this.spawn.x + 60, y: this.spawn.y - 40, type: NPCTypes.moth }));
	}

	chunkKey(chunkX, chunkY) { return `${chunkX},${chunkY}`; }

	updateStreaming(force = false) {
		const centers = [[
			Math.floor(this.player.x / BLOCK_SIZE / this.chunkSize),
			Math.floor(this.player.y / BLOCK_SIZE / this.chunkSize),
		]];
		if (this.camera) {
			centers.push([
				Math.floor(this.camera.x / this.camera.z / BLOCK_SIZE / this.chunkSize),
				Math.floor(this.camera.y / this.camera.z / BLOCK_SIZE / this.chunkSize),
			]);
		}
		const wanted = new Set();
		let changed = false;
		for (const [centerX, centerY] of centers) for (let y = centerY - this.loadRadius; y <= centerY + this.loadRadius; y++) for (let x = centerX - this.loadRadius; x <= centerX + this.loadRadius; x++) {
			if (x < 0 || y < 0 || x * this.chunkSize >= this.mapWidth || y * this.chunkSize >= this.mapRows.length) continue;
			const key = this.chunkKey(x, y); wanted.add(key); if (!this.loadedChunks.has(key)) { this.loadChunk(x, y); changed = true; }
		}
		for (const [key, chunk] of this.loadedChunks) if (!wanted.has(key)) { this.unloadChunk(chunk); changed = true; }
		if (force || changed) { this.rebuildActiveBlocks(); this.refreshWater(); }
	}

	loadChunk(chunkX, chunkY) {
		const chunk = { chunkX, chunkY, blocks: [], cells: [] }, startX = chunkX * this.chunkSize, startY = chunkY * this.chunkSize;
		for (let y = startY; y < Math.min(startY + this.chunkSize, this.mapRows.length); y++) for (let x = startX; x < Math.min(startX + this.chunkSize, this.mapWidth); x++) {
			const symbol = this.mapRows[y][x];
			if (symbol === 'F') {
				let runStart = x;
				while (runStart > 0 && this.mapRows[y][runStart - 1] === 'F') runStart--;
				if (runStart !== x) continue;
				let runEnd = x + 1;
				while (runEnd < this.mapWidth && this.mapRows[y][runEnd] === 'F') runEnd++;
				const block = new Block({ x: runStart * BLOCK_SIZE, y: y * BLOCK_SIZE, w: (runEnd - runStart) * BLOCK_SIZE, type: BlockTypes.fire });
				chunk.blocks.push(block);
				for (let cellX = runStart; cellX < runEnd; cellX++) {
					const cellKey = `${cellX},${y}`;
					chunk.cells.push(cellKey);
					this.blockByCell.set(cellKey, block);
				}
				continue;
			}
			const type = TILE_SYMBOLS[symbol]; if (!type) continue;
			const block = new Block({ x: x * BLOCK_SIZE, y: y * BLOCK_SIZE, type }); chunk.blocks.push(block);
			const cellKey = `${x},${y}`; chunk.cells.push(cellKey); this.blockByCell.set(cellKey, block);
		}
		this.loadedChunks.set(this.chunkKey(chunkX, chunkY), chunk);
	}

	unloadChunk(chunk) { for (const cellKey of chunk.cells) this.blockByCell.delete(cellKey); this.loadedChunks.delete(this.chunkKey(chunk.chunkX, chunk.chunkY)); }
	rebuildActiveBlocks() { this.blocks.length = 0; for (const chunk of this.loadedChunks.values()) this.blocks.push(...chunk.blocks); }

	refreshWater() {
		for (const key in Water.waterSurfaceByColumn) delete Water.waterSurfaceByColumn[key]; Water.waterLightDisturbances.length = 0; Water.lightStreaksWide.length = 0; Water.lightStreaksFine.length = 0;
		for (const block of this.blocks) if (block.type === BlockTypes.water && (Water.waterSurfaceByColumn[block.x] === undefined || block.y < Water.waterSurfaceByColumn[block.x])) Water.waterSurfaceByColumn[block.x] = block.y;
		Water.buildWaterSurfaceSegments();
	}

	blockAt(x, y) {
		const cellX = Math.floor(x / BLOCK_SIZE), cellY = Math.floor(y / BLOCK_SIZE); if (cellX < 0 || cellY < 0 || cellX >= this.mapWidth || cellY >= this.mapRows.length) return null;
		const chunkX = Math.floor(cellX / this.chunkSize), chunkY = Math.floor(cellY / this.chunkSize), key = this.chunkKey(chunkX, chunkY);
		if (!this.loadedChunks.has(key)) {
			this.loadChunk(chunkX, chunkY);
			this.rebuildActiveBlocks();
		}
		if (!this.blockByCell.has(`${cellX},${cellY}`) && this.mapRows[cellY][cellX] === 'F') {
			let runStart = cellX;
			while (runStart > 0 && this.mapRows[cellY][runStart - 1] === 'F') runStart--;
			const ownerKey = this.chunkKey(Math.floor(runStart / this.chunkSize), chunkY);
			if (!this.loadedChunks.has(ownerKey)) {
				this.loadChunk(Math.floor(runStart / this.chunkSize), chunkY);
				this.rebuildActiveBlocks();
			}
		}
		return this.blockByCell.get(`${cellX},${cellY}`) ?? null;
	}

	blockAtNormalizedScale(x, y) { return this.blockAt(x * BLOCK_SIZE, y * BLOCK_SIZE); }
}
