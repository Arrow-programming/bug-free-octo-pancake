/**
 * All the helper functions
 * I guess they don't really need to be in the Funcs object
 */

import { Hitbox } from "./hitbox.js";

const buf = new ArrayBuffer(8);
const f64 = new Float64Array(buf);
const u32 = new Uint32Array(buf); // u32[0] = low word, u32[1] = high word
// Now f64 and u32 are a set of quantum entangled arrays.

const SIGN = 0b10000000_00000000_00000000_00000000;
const EXPN = 0b01111111_11110000_00000000_00000000;
const MTS1 = 0b00000000_00001111_11111111_11111111; // mantissa 1
const MHGH = 0b00000000_00001000_00000000_00000000; // highest bit of mantissa
const ELOW = 0b00000000_00010000_00000000_00000000; // lowest bit of exponent
const MTS0 = 0b11111111_11111111_11111111_11111111; // mantissa 0

export const Funcs = {
	constrain(aNumber, aMin, aMax) {
		return aNumber > aMax ? aMax : aNumber < aMin ? aMin : aNumber;
	},

	lerp(value1, value2, amt) {
		return ((value2 - value1) * amt) + value1;
	},

	sweepT(a1, a2, b1, b2) {
		// a1 + (a2 - a1) * t = b1 + (b2 - b1) * t
		// a1 - b1 = (b2 - b1 - a2 + a1) * t
		// TODO: handle edge case where for some silly reason b2 - b1 == a2 - a1
		return (a1 - b1) / (b2 - b1 - a2 + a1);
	},

	mod(t, a) {
		return t - a * Math.floor(t / a);
	},

	/** Returns number immediately above given in IEEE-754 float representation.
	 * 
	 * Notes: NOT thread safe with this function or epsilonDown.
	 * 
	 * Also. Please don't touch this if you're not xyzyyxx. :)
	 * 
	 * @param {number} val 
	 * @returns {number}
	 */
	epsilonUp(val) {
		if (Number.isNaN(val)) return NaN;
		if (val == +Infinity || val == Number.MAX_VALUE) return +Infinity;
		if (val == -Infinity) return -Number.MAX_VALUE;
		f64[0] = val;
		if (val === 0) return Number.MIN_VALUE;
		if (val === -Number.MIN_VALUE) return -0;
		let sign = u32[1] & SIGN;
		let expn = u32[1] & EXPN;
		let mts1 = u32[1] & MTS1; // mantissa 1
		let mts0 = u32[0];
		if (sign) {
			// negative
			if (--mts0 === -1) {
				if (mts1 === 0) {
					mts1 = MTS1;
					expn -= ELOW;
				} else --mts1;
				// edge cases where mts1 === 0 can be safely ignored due to the guards at the top of the fn.
			}
		} else {
			// positive
			if (++mts0 > MTS0) {
				++mts1;
				if (mts1 > MTS1) {
					mts1 = 0;
					expn += ELOW;
					// edge cases with expn overflow can be safely ignored due to the guards at the top of the fn.
				}
			}
		}
		u32[0] = mts0;
		u32[1] = sign | expn | mts1;
		return f64[0];
	},

	/** Returns number immediately below given in IEEE-754 float representation.
	 * 
	 * Notes: NOT thread safe with this function or epsilonUp.
	 * 
	 * @param {number} val 
	 * @returns {number}
	 */
	epsilonDown(val) {
		return -this.epsilonUp(-val);
	}
};

// monkeh
Array.prototype.filterInPlace = function(predicate) {
	let j = 0;
	for (let i = 0; i < this.length; ++i) {
		if (predicate(this[i])) this[j++] = this[i];
	}
	this.length = j;
	return this;
}