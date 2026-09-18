// This file is pure magic.

const halfPi = Math.PI / 2;
const threeHalfPi = Math.PI * 3 / 2;
const twoPi = Math.PI * 2;

export const LcMath = {
    __internal: {
        noCheck_cos(value) {
            const vsq = value * value;
            return 1 - vsq / 2 * (1 - vsq / 12 * (1 - vsq / 30));
        },
        
        noCheck_beyondThreeHalf_cos(value) {
            if (value > halfPi) return this.noCheck_cos(Math.PI - value);
            if (value < -halfPi) return this.noCheck_cos(-Math.PI - value);

            return this.noCheck_cos(value);
        },


        noCheck_sin(value) {
            const vsq = value * value;
            return value * (1 - vsq / 6 * (1 - vsq / 20 * (1 - vsq / 42)));
        },
        
        noCheck_beyondThreeHalf_sin(value) {
            if (value > halfPi) return this.noCheck_sin(Math.PI - value);
            if (value < -halfPi) return this.noCheck_sin(-Math.PI - value);

            return this.noCheck_sin(value);
        },
    },

    cos(value) {
        if (value >= threeHalfPi) return this.__internal.noCheck_beyondThreeHalf_cos((value + halfPi) % twoPi - halfPi);
        if (value <= -threeHalfPi) return this.__internal.noCheck_beyondThreeHalf_cos((value - halfPi) % twoPi + halfPi);

        return this.__internal.noCheck_beyondThreeHalf_cos(value);
    },

    sin(value) {
        if (value >= threeHalfPi) return this.__internal.noCheck_beyondThreeHalf_sin((value + halfPi) % twoPi - halfPi);
        if (value <= -threeHalfPi) return this.__internal.noCheck_beyondThreeHalf_sin((value - halfPi) % twoPi + halfPi);

        return this.__internal.noCheck_beyondThreeHalf_sin(value);
    },
};