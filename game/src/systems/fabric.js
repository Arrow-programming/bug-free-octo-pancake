/**
 * All the Fabric related physics
 */
import { GRAVITY } from '../utils/constants.js'
import { rasterizer } from '../graphics.js'


class Point {
	constructor(options = {}) {
		this.x = options.x ?? 0;
		this.y = options.y ?? 0;

		this.px = this.x;
		this.py = this.y;

		this.parent = null;
		this.locked = options.locked ?? false;
		this.active = options.active ?? true

		this.offsetX = 0;
		this.offsetY = 0;

	}

	update() {
		if (this.locked || this.grabbed || !this.active) {
			return;
		}

		if (this.parent) {
			this.x = this.parent.x + this.offsetX;
			this.y = this.parent.y + this.offsetY;

			this.px = this.x;
			this.py = this.y;

			return;
		}

		const damping = 0.85;
		const vx = (this.x - this.px) * damping;
		const vy = (this.y - this.py) * damping;

		this.px = this.x;
		this.py = this.y;

		this.x += vx;
		this.y += vy + GRAVITY;
	}
}

class Constraint {
	constructor(pt1, pt2, length, stiffness) {
		this.pt1 = pt1;
		this.pt2 = pt2;
		this.length = length;
		this.stiffness = stiffness;
	}

	update() {
		const dx = this.pt2.x - this.pt1.x;
		const dy = this.pt2.y - this.pt1.y;

		const dist = Math.sqrt(dx * dx + dy * dy);

		const diff = this.length - dist;
		const ratio = diff / dist * this.stiffness

		const offX = dx * ratio;
		const offY = dy * ratio;

		if (!this.pt1.locked) {
			this.pt1.x -= offX;
			this.pt1.y -= offY;
		}

		if (!this.pt2.locked) {
			this.pt2.x += offX;
			this.pt2.y += offY
		}
	}
}

export class Fabric {

	constructor(options = {}) {
		this.x = options.x ?? 0;
		this.y = options.y ?? 0;
		this.vx = options.vx ?? 0;
		this.vy = options.vy ?? 0;

		this.points = [];
		this.constraints = [];


		this.spacing = options.spacing

		this.stiffness = options.stiffness ?? 0.5;

		this.lockedTop = options.lockedTop ?? true;
		this.shapeMap = options.shapeMap ?? []

		this.cols = (this.shapeMap[0] ? this.shapeMap[0].length : (options.cols ?? 0));
		this.rows = this.shapeMap.length > 0 ? this.shapeMap.length : (options.rows ?? 0);
	}

	init() {
		if (this.shapeMap.length == 0) {
			for (let y = 0; y < this.rows; y++) {
				for (let x = 0; x < this.cols; x++) {
					this.points.push(new Point({
						x: this.x + x * this.spacing,
						y: this.y + y * this.spacing,
						locked: this.lockedTop && y == 0 && x % 5 == 0
					}))
				}
			}


		}
		else {
			for (let y = 0; y < this.rows; y++) {
				for (let x = 0; x < this.cols; x++) {
					const char = this.shapeMap[y][x];

					this.points.push(new Point({
						x: this.x + x * this.spacing,
						y: this.y + y * this.spacing,
						locked: char == '2',
						active: char != ' '
					}))
				}
			}
		}

		// Add constraints
		for (let y = 0; y < this.rows; y++) {
			for (let x = 0; x < this.cols; x++) {
				const idx = y * this.cols + x;
				const currentPt = this.points[idx];

				if (x < this.cols - 1) {
					const nextPt = this.points[y * this.cols + (x + 1)];
					if (currentPt.active && nextPt.active) {
						this.constraints.push(new Constraint(currentPt, nextPt, this.spacing, this.stiffness));
					}
				}

				if (y < this.rows - 1) {
					const nextPt = this.points[(y + 1) * this.cols + x];
					if (currentPt.active && nextPt.active) {
						this.constraints.push(new Constraint(currentPt, nextPt, this.spacing, this.stiffness));
					}
				}


			}
		}

		// Add triangles
		for (let y = 0; y < this.rows - 1; y++) {
			for (let x = 0; x < this.cols - 1; x++) {
				const a = this.points[y * this.cols + x];
				const b = this.points[y * this.cols + x + 1];
				const c = this.points[(y + 1) * this.cols + x];
				const d = this.points[(y + 1) * this.cols + x + 1];

				if (a.active && b.active && c.active && d.active) {
					rasterizer.addTriangle(a, b, c);
					rasterizer.addTriangle(b, d, c);
				}
			}
		}
	}

	display() {
		ctx.strokeStyle = 'black';
		ctx.beginPath();

		for (const c of this.constraints) {
			ctx.moveTo(c.pt1.x, c.pt1.y);
			ctx.lineTo(c.pt2.x, c.pt2.y);
		}

		ctx.stroke();
	}

	update() {
		for (const p of this.points) {
			p.update();
		}

		for (let i = 0; i < 20; i++) {
			for (const c of this.constraints) {
				c.update();
			}
		}

		for (const p of this.points) {
			if (p.parent) {
				p.x = p.parent.x + p.offsetX;
				p.y = p.parent.y + p.offsetY;

				p.px = p.x;
				p.py = p.y;
			}
		}
	}
}

