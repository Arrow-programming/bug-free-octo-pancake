/**
 * Keyboard, mouse, etc input handlers
 */

export let keys = {};

/* Key events */
var EL = window.addEventListener;
EL('keydown', (e) => {
    e.preventDefault();
    keys[e.which] = true;
});
EL('keyup', (e) => {
    e.preventDefault();
    keys[e.which] = false;
});