import { BLOCK_SIZE, WATER_LIGHT_BEND } from './utils/constants.js';
import { Bounds, Grid, Raster } from './utils/dataStructures.js';
import { Block } from './objects/blocks.js';
import { BlockTypes } from './objects/typedecls.js';
import { NPC, NPCTypes } from './objects/npcs.js'
import { Lighting } from './environment/lighting.js';
import * as Water from './environment/water.js';

// Change an entry to 'low', 'medium', or 'high' to tune that level's rain.
export const LEVEL_RAIN_INTENSITIES = ['medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium'];

export const LEVELS = [
	[
		'                &&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&_________________________#####################&&&&&&&&&&&&&&&&&&&&&',
		'              __    !',
		'          #     ',
		'          #      !!',
		' FFFFF    #FFF  ',
		'######    ####   ',
		'        @#  %##  ',
		' F       ######   ',
		' #WWWWWW##  !!# #####',
		'   #WWWWWW##     ',
		'  ##WWWWW#####   ',
		'  ####WWWWW#####F',
		'      #WWWWWWWW########',
		'      #WWWWWWWWWW######',
		'########WWWWWWWWWW#######',
		'####WWWWWWWWWWWWWWWWW#######',
		'##WWWWWWWWWWWWWWWWWWWWW#######',
		'#######WWWWWWWWWWWWWWW######',
		'#######################',
		'',
	],
	[
		'     ',
		' #   #',
		'#   !#',
		'     #!',
		'#        ',
		'#@         ',
		'####&&!# %',
		'#############',
	],
	[
		' ',
		' #',
		' #',
		' # @#',
		' ###',
		' ! !##',
		'   ',
		' #  ',
		' #%###',
	],
	[
		'#################',
		'    #######',
		' #####!',
		'###       ',
		'#!       !   !',
		'#     @  !   !',
		'       #########',
		' #######%',
		'####   #',
		'!#      w#######',
	],
	[
		'',
		'',
		'',
		'        #      #      #',
		'@  #    !      !      %',
		'#  !',
		'!',
	],
	[
		'  ##!',
		'  !###',
		' ## ###',
		' #! #!',
		'  # ##@',
		'  % ####       %',
		'    ############',
	],
	[],
];

export class LevelHandler {
	constructor({ player, camera, npcs, onResetRain } = {}) {
		this.player = player;
		this.camera = camera;
		this.npcs = npcs;
		this.onResetRain = onResetRain ?? (() => {});
		this.blockGrid = null;
		this.blocks = [];
		this.mapWidth = 0;
		this.current = 0;
		this.width = 0;
		this.height = 0;
		this.grid = null;
		this.levelArray = null;
		this.lighting = null;
	}

	blockTypes = {
		"#": BlockTypes.block,
		"!": BlockTypes.hazard,
		"%": BlockTypes.portal,
		"$": BlockTypes.tramp,
		"_": BlockTypes.mud,
		"&": BlockTypes.ice,
		"W": BlockTypes.water,
	};


	setup(index) {
		const map = LEVELS[index] ?? LEVELS[0];
		this.current = index;
		let longest = 0;
		for (let row = 0; row < map.length; ++row) longest = Math.max(longest, map[row].length);
		this.mapWidth = longest;

		this.blockGrid = new Array(longest * map.length).fill(null);
		this.blocks.length = 0;

		for (let row = 0; row < map.length; ++row) {
			const line = map[row];

			for (let col = 0; col < line.length; ++col) {
				const symbol = line[col];
				const x = col * BLOCK_SIZE, y = row * BLOCK_SIZE;

				if (symbol === 'F') {
					let end = col;
					while (line[end++] === 'F');
					const sharedFireReference = new Block({
						x: x,
						y: y,
						w: BLOCK_SIZE * (end - col - 1),
						h: BLOCK_SIZE,
						type: BlockTypes.fire,
					});
					const rmw = row * this.mapWidth;
					for (; col < end; ++col) this.blockGrid[col + rmw] = sharedFireReference;
					this.blocks.push(sharedFireReference);
				} else if (symbol === '@') {
					this.player.reset(x, y);
				} else if (symbol !== " " && symbol in this.blockTypes) {
					const sharedBlockReference = new Block({ x: x, y: y, type: this.blockTypes[symbol] });
					this.blockGrid[col + row * this.mapWidth] = sharedBlockReference;
					this.blocks.push(sharedBlockReference);
				}
			}
		}

		this.width = longest * BLOCK_SIZE;
		this.height = map.length * BLOCK_SIZE;
		for (const key in Water.waterSurfaceByColumn) {
			delete Water.waterSurfaceByColumn[key];
		}
		Water.waterLightDisturbances.length = 0;
		Water.lightStreaksWide.length = 0;
		Water.lightStreaksFine.length = 0;
		for (const block of this.blockGrid) {
			if (block && block.type === BlockTypes.water && (Water.waterSurfaceByColumn[block.x] === undefined || block.y < Water.waterSurfaceByColumn[block.x])) {
				Water.waterSurfaceByColumn[block.x] = block.y;
			}
		}
		Water.buildWaterSurfaceSegments();
		Water.lightStreaksWide.push(...Water.createLightStreaks(this.width, {
			minWidth: 18,
			maxWidth: 65,
			minGap: 10,
			maxGap: 95,
			minOpacity: 0.16,
			maxOpacity: 0.55,
			swayAmp: 20,
			tilt: -Math.tan(22 * Math.PI / 180) * (BLOCK_SIZE / 9),
			palette: ['#3f96da', '#4fc3ff', '#63cdff', '#7fd6ee'],
		}));
		Water.lightStreaksFine.push(...Water.createLightStreaks(this.width, {
			minWidth: 6,
			maxWidth: 20,
			minGap: 15,
			maxGap: 110,
			minOpacity: 0.3,
			maxOpacity: 0.95,
			swayAmp: 12,
			tilt: -Math.tan(22 * Math.PI / 180) * (BLOCK_SIZE / 9),
			palette: ['#bff2ff', '#e2fbff', '#9fe6ff', '#d0f6ff'],
		}));
		this.grid = new Grid();
		this.grid.setSize(BLOCK_SIZE);
		this.levelArray = Raster.fromBitmap(map);
		this.cameraBounds = new Bounds(-innerWidth, -innerHeight, this.width + innerWidth * 1.5, this.height + innerHeight * 1.5);
		this.lighting = new Lighting(
			this.grid,
			{
				airDecay: 0.9,
				groundDecay: 0.7,
				minLevel: 0.08,
				playerLightRadius: 5,
				playerLightStrength: 0.95,
			},
		);
		this.onResetRain(this.current);

		// test npc
		this.npcs.add(new NPC({
			x: 360, y: 260,
			type: NPCTypes.moth
		}));

		return 0;
	}

	blockAt(x, y) {
		return this.blockGrid[Math.floor(x / BLOCK_SIZE) + Math.floor(y / BLOCK_SIZE) * this.mapWidth] ?? null;
	}

	blockAtNormalizedScale(x, y) {
		return this.blockGrid[x + y * this.mapWidth] ?? null;
	}
}