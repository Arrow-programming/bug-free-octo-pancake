/**
 * 
 * Thank you so much Mushy Avocado!
 * 
 * Contstructors by Mushy Avocado, comments by me
 * 
 **/

//defines a rectangular area with functions to calculate boundaries from two points
export class Bounds {
	//creates a Bounds instance by determining top-left origin and dimensions from any two corners
	static fromCorners(x1, y1, x2, y2) {
		const x = Math.min(x1, x2);
		const y = Math.min(y1, y2);
		const width = Math.abs(x1 - x2);
		const height = Math.abs(y1 - y2);
		return new Bounds(x, y, width, height);
	}

	//horizontal and vertical origin
	x = 0;
	y = 0;

	width = 0;
	height = 0;


	constructor(x, y, width, height) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
	}

	//right edge coordinate
	get maxX() {
		return this.x + this.width;
	}

	//bottom edge coordinate
	get maxY() {
		return this.y + this.height;
	}
}

//coordinate conversions between world space and a fixed-size grid system
export class Grid {
	//default pixel size of a single grid cell
	size = 40;


	setSize(value) {
		this.size = value;
	}

	//converts cell index to pixel coordinate and vice-versa
	cellToWorld(x) {
		return x * this.size;
	}
	worldToCell(x) {
		return Math.floor(x / this.size);
	}

	//calculates which grid cell indices are covered by a specific world-space bounds object
	getIndicesFromBounds(bounds) {
		return Bounds.fromCorners(
			Math.floor(bounds.x / this.size),
			Math.floor(bounds.y / this.size),
			Math.ceil(bounds.maxX / this.size),
			Math.ceil(bounds.maxY / this.size)
		);
	}

	//generator that iterates through every cell coordinate within the provided bounds
	* visitCells(bounds) {
		const indexBounds = this.getIndicesFromBounds(bounds);
		for (let x = indexBounds.x; x < indexBounds.maxX; x++) {
			for (let y = indexBounds.y; y < indexBounds.maxY; y++) {
				yield {
					x,
					y
				};
			}
		}
	}

}

//A 2D data structure for storing and retrieving values (like characters or light levels) at coordinates
export class Raster {
	//nested array representing rows and columns
	data = [];

	set(x, y, value) {
		if (!this.data[y]) {
			this.data[y] = [];
		}
		this.data[y][x] = value;
	}

	//retrieves value or returns null if undefined
	get(x, y) {
		return this.data[y]?.[x] ?? null;
	}

	//resets entire data set
	clear() {
		this.data.length = 0;
	}


	//static factory that converts strings or 2D arrays into a populated Raster instance
	static fromBitmap(bitmap, converter = null) {
		const raster = new Raster();
		if (typeof bitmap === "string") {
			bitmap = bitmap.split("\n");
		}
		bitmap.forEach((row, y) => {
			if (typeof row === "string") {
				row = row.split("");
			}
			row.forEach((symbol, x) => {
				if (converter) {
					raster.set(x, y, converter(x, y, symbol));
				} else {
					raster.set(x, y, symbol);
				}
			});
		});
		return raster;
	}
}