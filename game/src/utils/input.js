/**
 * Keyboard, mouse, etc input handlers
 */

class Input {
    constructor() {
        this.keyMap = {
            Right: ['KeyD', 'ArrowRight'],
            Left: ['KeyA', 'ArrowLeft'],
            Up: ['KeyW', 'ArrowUp'],
            Down: ['KeyS', 'ArrowDown'],
            Pause: ['KeyP', null],
			Action: ['Space', 'Enter'],
        };

        this.pressed = {};
        this.clicked = {};
        this.released = {};

        document.addEventListener('keydown', (e) => {
			e.preventDefault();
            this.clicked[e.code] = true;
            this.pressed[e.code] = true;
        });

        document.addEventListener('keyup', (e) => {
			e.preventDefault();
            this.pressed[e.code] = false;
            this.released[e.code] = true;
        });
    }

    update() {
        for(const k in this.clicked)  this.clicked[k] = false;
        for(const k in this.released) this.released[k] = false;
    }

    press(action) {
        return this.keyMap[action].some(k => this.pressed[k]);
    }

    click(action) {
        return this.keyMap[action].some(k => this.clicked[k]);
    }

    release(action) {
        return this.keyMap[action].some(k => this.released[k]);
    }
}
export const input = new Input();

class Mouse {
    constructor() {
        this.x = 0;
        this.y = 0;

        this.clicked = false;
        this.released = false;
        this.pressed = false;

		this.inside = true;

        document.addEventListener('mousemove', (e) => {
            this.x = e.clientX;
            this.y = e.clientY;
        });

        document.addEventListener('mousedown', (e) => {
            this.clicked = true;
            this.pressed = true;
        });

        document.addEventListener('mouseup', (e) => {
            this.released = true;
            this.pressed = false;
        });

		document.addEventListener('wheel', (e) => {
			this.wheel = e.deltaY;
		});
    }

    update() {
        this.clicked = false;
        this.released = false;
    }

    overRect(x, y, width, height) {
        return (
            this.x > x - width / 2 &&
            this.x < x + width / 2 &&
            this.y > y - height / 2 &&
            this.y < y + height / 2
        );
    }

    overCircle(x, y, rad) {
        const dx = this.x - x;
        const dy = this.y - y;

        return Math.sqrt(dx * dx + dy * dy) < rad;
    }
}
export const mouse = new Mouse();