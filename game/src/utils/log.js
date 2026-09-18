export class Log {
    constructor(elementId = 'log') {
        this.element = document.getElementById(elementId) ?? this.createElement(elementId);
        this.entries = new Map();
        this.graphs = new Map();
        this.frame = null;
        this.render();
    }

    createElement(elementId) {
        const element = document.createElement('div');
        element.id = elementId;
        document.body.appendChild(element);
        return element;
    }

    createEntry(type, key, value) {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `${type.toUpperCase()}: ${key}${value === undefined ? '' : ` ${this.stringify(value)}`}`;
        return entry;
    }

    stringify(value) {
        if (typeof value === 'object' && value !== null) {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return String(value);
    }

    log(key, value) {
        this.entries.set(`log:${key}`, ['log', key, value]);
        this.render();
    }

    info(key, value) {
        this.entries.set(`info:${key}`, ['info', key, value]);
        this.render();
    }

    warn(key, value) {
        this.entries.set(`warn:${key}`, ['warn', key, value]);
        this.render();
    }

    error(key, value) {
        this.entries.set(`error:${key}`, ['error', key, value]);
        this.render();
    }

    render() {
        this.element.replaceChildren();
        const heading = document.createElement('div');
        heading.className = 'log-heading';
        heading.textContent = 'Log';
        this.element.appendChild(heading);
        for (const [type, key, value] of this.entries.values()) {
            this.element.appendChild(this.createEntry(type, key, value));
        }
        for (const graph of this.graphs.values()) this.element.appendChild(graph.canvas);
    }

    createGraph(key, getter, options = {}) {
        this.removeGraph(key);
        const opts = {
            width: 240,
            height: 48,
            color: '#9ad0ff',
            background: 'rgba(0, 0, 0, 0.18)',
            buffer: 120,
            min: null,
            max: null,
            ...options,
        };
        const canvas = document.createElement('canvas');
        canvas.width = opts.width;
        canvas.height = opts.height;
        canvas.className = 'log-graph';
        canvas.title = key;
        this.graphs.set(key, { canvas, context: canvas.getContext('2d'), getter, opts, history: [] });
        this.render();
        this.startGraphUpdates();
    }

    removeGraph(key) {
        this.graphs.get(key)?.canvas.remove();
        this.graphs.delete(key);
        if (!this.graphs.size && this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
    }

    startGraphUpdates() {
        if (this.frame !== null) return;
        const update = () => {
            if (!this.graphs.size) {
                this.frame = null;
                return;
            }
            this.updateGraphs();
            this.frame = requestAnimationFrame(update);
        };
        this.frame = requestAnimationFrame(update);
    }

    updateGraphs() {
        for (const [key, graph] of this.graphs) {
            let value = Number(typeof graph.getter === 'function' ? graph.getter() : graph.getter);
            if (!Number.isFinite(value)) value = 0;
            graph.history.push(value);
            if (graph.history.length > graph.opts.buffer) graph.history.shift();

            const min = typeof graph.opts.min === 'number' ? graph.opts.min : Math.min(...graph.history, 0);
            let max = typeof graph.opts.max === 'number' ? graph.opts.max : Math.max(...graph.history, 1);
            if (max - min < 0.000001) max = min + 1;
            const { context, canvas, history } = graph;
            const width = canvas.width;
            const height = canvas.height;
            context.clearRect(0, 0, width, height);
            context.fillStyle = graph.opts.background;
            context.fillRect(0, 0, width, height);
            context.beginPath();
            history.forEach((entry, index) => {
                const x = 2 + index * (width - 4) / Math.max(graph.opts.buffer - 1, 1);
                const y = height - 4 - ((entry - min) / (max - min)) * (height - 8);
                if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
            });
            context.strokeStyle = graph.opts.color;
            context.lineWidth = 2;
            context.stroke();
            context.fillStyle = graph.opts.color;
            context.font = '12px monospace';
            context.textBaseline = 'top';
            context.fillText(`${key}: ${value.toFixed(2)}`, 4, 3);
        }
    }

    clear() {
        this.entries.clear();
        this.render();
    }
}

export const log = new Log();