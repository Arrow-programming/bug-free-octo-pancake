/**
 * Camera object and shaking code
 */


//camera shake
export const shakes = []; 
export let shake = {
    x: 0,
    y: 0,
};
export const Shake = (function () {
    let Shake = function (n) {
        //shake power
        this.n = n;
    };
    Shake.prototype = {
        active: function(increment){
            //apply shake
            shake.x = (Math.random()*2-1)*this.n;
            shake.y = (Math.random()*2-1)*this.n;
            
            //fade the shake
            this.n -= 0.5;
            
            if (this.n < 0) {
                shake.x = 0;
                shake.y = 0;
                shakes.splice(increment, 1);
            }
        }
    };
    return Shake;
})();

/* Camera object */
export const cam = {
    x: player.x,
    y: player.y,
    z: 1,
    update() {
        this.x = Funcs.lerp(this.x, player.x * this.z, 0.1);
        this.y = Funcs.lerp(this.y, player.y * this.z, 0.1);
        graphics.ctx.translate(~~(-this.x + shake.x + graphics.width / 2 ), ~~(-this.y + shake.y + graphics.height / 2));
        graphics.ctx.scale(this.z, this.z);
    },
};