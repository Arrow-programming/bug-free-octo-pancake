import { graphics } from '../graphics.js';
import { Funcs } from '../utils/funcs.js';

export class Camera {
	constructor(target, zoom = 1) {
		this.target = target;
		this.x = target.x;
		this.y = target.y;
		this.z = zoom;
		this.editorPanX = 0;
		this.editorPanY = 0;
		this.shakes = [];
		this.shake = { x: 0, y: 0 };
	}

	addShake(power) {
		this.shakes.push({ power });
	}

	panBy(screenX, screenY) {
		this.editorPanX += screenX;
		this.editorPanY += screenY;
	}

	resetPan() {
		this.editorPanX = 0;
		this.editorPanY = 0;
	}

	update() {
		for (let i = this.shakes.length - 1; i >= 0; i--) {
			const current = this.shakes[i];
			this.shake.x = (Math.random() * 2 - 1) * current.power;
			this.shake.y = (Math.random() * 2 - 1) * current.power;
			current.power -= 0.5;
			if (current.power < 0) {
				this.shakes.splice(i, 1);
			}
		}
		if (!this.shakes.length) {
			this.shake = { x: 0, y: 0 };
		}
		this.x = Funcs.lerp(this.x, this.target.x * this.z + this.editorPanX, 0.1);
		this.y = Funcs.lerp(this.y, this.target.y * this.z + this.editorPanY, 0.1);
		graphics.ctx.translate(
			~~(-this.x + this.shake.x + graphics.width / 2),
			~~(-this.y + this.shake.y + graphics.height / 2)
		);
		graphics.ctx.scale(this.z, this.z);
	}
}