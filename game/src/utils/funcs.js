/**
 * All the helper functions
 * I guess they don't really need to be in the Funcs object
 */


export const Funcs = {
    constrain: (aNumber, aMin, aMax) => {
        return aNumber > aMax ? aMax : aNumber < aMin ? aMin : aNumber;
    },

    lerp: (value1, value2, amt) => {
        return ((value2 - value1) * amt) + value1;
    },

    edgeCheck: (a, b) => {
        return (
            a.x + a.w > b.x &&
            a.x < b.x + b.w &&
            a.y + a.h > b.y &&
            a.y < b.y + b.h
        );
    }
};