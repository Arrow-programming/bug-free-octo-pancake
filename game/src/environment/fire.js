import { graphics } from '../graphics.js'
import { LcMath } from '../utils/lcMath.js'
import { Funcs } from '../utils/funcs.js'

// If we use this in other places, might want to move it to helper funcs.js
//Smooth max function my hero
let smax = (a, b, epsilon) => {
	return (a + b + Math.sqrt((a - b) * (a - b) + epsilon)) / 2;
}

let radiation = (temp, alpha = 1) => {
	//There are two regimes here: The "cold" regime under 270 K, in which all of the colors spike to blue/white. Just a linear function.
	//The second regime is the regime in which the hot metal releases thermal radiation. I just use some cubic interpolation.
	//To combine the two I use the smooth max function.
	let x, y, r, g, b;
	//Normalize from 0-1
	temp /= 1000;
	// 3x^2-2x^3 cubic polynomial.
	x = 3 * temp * temp - 2 * temp * temp * temp;
	//Linear (cold)
	y = -18 * (temp - 0.24);
	r = smax(x, y, 0.1);
	//Linear (cold)
	x = -24 * (temp - 0.22);
	//-16x^3+36x^2-24x+5. This polynomial is shifted to interpolate from 0.5 to 1, since I don't want green early on. It's zero otherwise. I also multiply a little since there is too much green at the peak.
	y = temp < 0.5 ? 0 : (0.95 * (-16 * temp * temp * temp + 36 * temp * temp - 24 * temp + 5));
	g = smax(x, y, 1.4);
	//Linear (Cold)
	x = -20 * (temp - 0.2);
	//There is only blue at the very end.
	y = temp < 0.8 ? 0 : 2 * (temp - 0.8);
	b = 2 * smax(x, y, 1);
	return [255 * r, 255 * g, 255 * b];
}

export class Fire {
	static OCTAVES = 8;
	static AMPLITUDE = 0.6;
	static SPEED = 0.04;
	static FREQUENCY = 0.02;
	static EXP = 1.6;
	static EXP2 = 1.4;
	static gridSize = 5;
	static #cachedRadiance;
	static get cachedRadiance() {
		if (Fire.#cachedRadiance) {
			return Fire.#cachedRadiance;
		}
		let cachedRadiance = new Float32Array(3000);
		for (let i = 0; i < 1000; i++) {
			let result = radiation(i);
			cachedRadiance[3 * i] = result[0];
			cachedRadiance[3 * i + 1] = result[1];
			cachedRadiance[3 * i + 2] = result[2];
		}
		return Fire.#cachedRadiance = cachedRadiance;
	}
	constructor(x, y, w, h) {
		this.x = x;
		this.y = y;
		this.w = w;
		this.h = h;
		this.t = 0;
		this.img = graphics.ctx.createImageData(~~(this.w / Fire.gridSize), ~~(this.h / Fire.gridSize));
		this.canvas = new OffscreenCanvas(this.w / Fire.gridSize, this.h / Fire.gridSize);
		this.ctx = this.canvas.getContext('2d');
		this.ctx.imageSmoothingEnabled = false;

		this.ang = 0.77;
		this.cosAng = Math.cos(this.ang);
		this.sinAng = Math.sin(this.ang);

		this.m00 = 0;
		this.m01 = 0;
		this.m10 = 0;
		this.m11 = 0;

		this.samplePos = { x: 0, y: 0 };
	}
	get pw() {
		return this.w / Fire.gridSize;
	}
	get ph() {
		return this.h / Fire.gridSize;
	}
	get data() {
		return this.img.data;
	}
	get frequency() {
		return Fire.FREQUENCY * Fire.gridSize;
	}

	smoothstep(a, b, x) {
		let t = Math.min(1, Math.max(0, (x - a) / (b - a)));
		return t * t * (3 - 2 * t)
	}

	mulMBySelf() {
		this.m00 = this.m00 * this.m00 + this.m01 * this.m10;
		this.m01 = this.m00 * this.m01 + this.m01 * this.m11;
		this.m10 = this.m10 * this.m00 + this.m11 * this.m10;
		this.m11 = this.m10 * this.m01 + this.m11 * this.m11;
	}

	sampleAt(x, y) {
		this.m00 = this.cosAng;
		this.m01 = -this.sinAng;
		this.m10 = this.sinAng;
		this.m11 = this.cosAng;

		let posY, sphase;
		this.mulMBySelf();
		let samplePos = this.samplePos;
		samplePos.x = x; samplePos.y = y;
		let freq = this.frequency, mult = this.frequency;

		let xstretch = 2 - 2.5 * this.smoothstep(-2, 2, (samplePos.y / this.ph - 1 / 2));
		let ystretch = 1 - 0.5 / (1 + (2 * x / this.pw - 1) * (2 * x / this.pw - 1));
		samplePos.x = (samplePos.x - this.pw / 2) * xstretch + this.pw / 2;
		samplePos.y = (samplePos.y - this.ph / 2) * ystretch + this.ph / 2;

		for (let i = 0; i < Fire.OCTAVES; i++) {
			posY = this.m00 * samplePos.x + this.m10 * samplePos.y;
			sphase = LcMath.sin(freq * posY + Fire.SPEED * (this.t + i) * (0.2 * i + 1) + i);
			samplePos.x += Fire.AMPLITUDE * this.m01 * sphase / (mult);
			samplePos.y += Fire.AMPLITUDE * this.m00 * sphase / (mult) + this.t / 6;

			this.mulMBySelf();
			freq *= Fire.EXP;
			mult *= Fire.EXP2;
		}
		return samplePos;
	}
	func(t) {
		return 1.5 * t * t - 0.3;
	}
	update(tex, dt) {
		this.t += dt * 60;
		const edgeFeather = Math.max(1, this.pw * 0.22);
		for (let x = 0; x < this.pw; x += 1) {
			const edgeDist = Math.min(x, this.pw - 1 - x);
			const edgeAttenuator = this.smoothstep(0, edgeFeather, edgeDist);
			for (let y = 0; y < this.ph; y += 1) {
				let i = 4 * (this.pw * y + x);
				let texPos = this.sampleAt(Funcs.mod(x, 600), Funcs.mod(y, 600));
				let texX = ((Math.floor(texPos.x) % 600) + 600) % 600;
				let texY = ((Math.floor(texPos.y) % 600) + 600) % 600;
				let texIdx = 4 * (600 * texY + texX);
				let temp = 300+tex.data[texIdx]*2;
				let attenuator = (y/this.ph)*(y/this.ph)*(y/this.ph)*edgeAttenuator;
				
				this.data[i] = Fire.cachedRadiance[~~temp*3];
				this.data[i+1] = Fire.cachedRadiance[~~temp*3+1];
				this.data[i+2] = Fire.cachedRadiance[~~temp*3+2];
				this.data[i+3] = attenuator*Math.pow(150*this.func(tex.data[texIdx]/255)+123,1.5);
			}
		}
	}
	draw(ctx) {
		this.ctx.putImageData(this.img, 0, 0);
		graphics.ctx.save();
		graphics.ctx.imageSmoothingEnabled = false;
		graphics.ctx.drawImage(this.canvas, this.x, this.y, this.w, this.h);
		graphics.ctx.restore();
	}
}
