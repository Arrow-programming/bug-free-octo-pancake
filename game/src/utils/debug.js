import { log } from './log.js';

export class Debug {
    constructor(game) {
        this.game = game;
        this.on = false;
        this.freeze = false;
        this.showMinimap = false;
        this.showDeltaTime = false;
        this.fps = 0;
        this.dt = 0;
        this.shiftDown = false;
        document.addEventListener('keydown', event => this.handleKey(event));
    }

    handleKey(event) {
        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            this.shiftDown = true;
            this.on = true;
            return;
        }
        if (!this.on || event.repeat) return;
        const actions = {
            Digit1: () => this.addFpsGraph(60),
            Digit2: () => this.addFpsGraph(180),
            Digit3: () => this.addRainGraphs(),
            Digit4: () => { this.game.rain.config.enabled = !this.game.rain.config.enabled; },
            Digit5: () => { this.game.debugLighting = !this.game.debugLighting; },
            Digit6: () => { this.freeze = !this.freeze; },
            Digit7: () => { this.showDeltaTime = !this.showDeltaTime; this.addDeltaGraph(); },
            Digit8: () => { this.showMinimap = !this.showMinimap; },
        };
        actions[event.code]?.();
    }

    update(dt) {
        this.dt = dt;
        this.fps = dt > 0 ? 1 / dt : 0;
        log.element.hidden = !this.on;
        if (!this.on) return;
        log.log('level', this.game.levels.current);
        log.log('player', `${Math.round(this.game.player.x)}, ${Math.round(this.game.player.y)}`);
        log.log('rain drops', this.getRainCount());
        log.log('blocks', this.game.levels.blocks.length);
        log.log('lighting', this.game.debugLighting ? 'on' : 'off');
        log.log('controls', '1 FPS  2 FPS  3 rain  4 rain  5 light  6 freeze  7 dt  8 map');
        if (this.showMinimap) log.log('minimap', `${this.game.player.x.toFixed(0)}:${this.game.player.y.toFixed(0)}`);
    }

    addFpsGraph(buffer) {
        log.createGraph(`fps (${buffer})`, () => this.fps, { min: 0, max: 120, buffer });
    }

    addDeltaGraph() {
        if (this.showDeltaTime) log.createGraph('delta time', () => this.dt * 1000, { min: 0, max: 100, color: '#ff8da1' });
        else log.removeGraph('delta time');
    }

    addRainGraphs() {
        log.createGraph('rain drops', () => this.getRainCount(), { min: 0, max: 4800, color: '#9ad0ff' });
        log.createGraph('rain splashes', () => this.game.rain.splashes.length, { min: 0, max: 100, color: '#7efc6e' });
    }

    getRainCount() {
        return Object.values(this.game.rain.layers).reduce((total, layer) => total + layer.drops.length, 0);
    }
}