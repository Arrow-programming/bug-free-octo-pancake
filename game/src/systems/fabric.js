/**
 * All the Fabric related physics
 * If we want we can put the rasterizer in another file if we use it for other things
 */
import { GRAVITY } from '../utils/constants.js'
export class Rasterizer {
    constructor(pixelSize) {
        this.pixelSize = pixelSize
        
        this.triangles = [];
    }
    
    static edgeRelation(a, b, c) {
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }
    
    clear() {
        this.pixels.fill(0);
    }
    
    setPixel(x, y, r, g, b, a=255) {
        if (x < 0 || y < 0 || x >= this.bufferCanvas.width || y >= this.bufferCanvas.height) return;

        const index = (y * this.bufferCanvas.width + x) * 4;

        this.pixels[index] = r;
        this.pixels[index + 1] = g;
        this.pixels[index + 2] = b;
        this.pixels[index + 3] = a;
    }
    
    addTriangle(pt1, pt2, pt3) {
        this.triangles.push([pt1, pt2, pt3])
    }
    
    drawTriangle(tri) {
        // Determine if triangle is facing backward (don't draw then)
        //if (Rasterizer.edgeRelation(tri[0], tri[1], tri[2]) < 0) return;
        
        const area = Rasterizer.edgeRelation(tri[0], tri[1], tri[2]);
        
        ctx.beginPath();
        
        // Get the min/max so you dont have to loop through the whole canvas
        const minX = Math.max(0, Math.floor(Math.min(tri[0].x, tri[1].x, tri[2].x) / this.pixelSize) * this.pixelSize);
        const minY = Math.max(0, Math.floor(Math.min(tri[0].y, tri[1].y, tri[2].y) / this.pixelSize) * this.pixelSize);
        const maxX = Math.min(canvas.width, Math.ceil(Math.max(tri[0].x, tri[1].x, tri[2].x) / this.pixelSize) * this.pixelSize);
        const maxY = Math.min(canvas.height, Math.ceil(Math.max(tri[0].y, tri[1].y, tri[2].y) / this.pixelSize) * this.pixelSize);
        

        for (let y = minY; y < maxY; y += this.pixelSize) {
            for (let x = minX; x < maxX; x += this.pixelSize) {
                const pt = {
                    x: x + this.pixelSize * 0.5,
                    y: y + this.pixelSize * 0.5
                };
                const ABP = Rasterizer.edgeRelation(tri[0], tri[1], pt); 
                const BCP = Rasterizer.edgeRelation(tri[1], tri[2], pt);
                const CAP = Rasterizer.edgeRelation(tri[2], tri[0], pt);
                
                // Draw if inside triangle
                if (area > 0 ? ABP >= 0 && BCP >= 0 && CAP >= 0 : ABP <= 0 && BCP <= 0 && CAP <= 0) {
                    ctx.fillStyle = ABP >= -0.1 && BCP >= -0.1 && CAP >= -0.1 ? 'red' : 'orange';
                    ctx.fillRect(Math.floor(pt.x), Math.floor(pt.y), this.pixelSize, this.pixelSize);
                }
            }
        }
        
    }
    
    raster() {
        for (const tri of this.triangles) {
            this.drawTriangle(tri)
        }
    }
    
    // drawTriangle(tri) {
    //     const a = tri[0];
    //     const b = tri[1];
    //     const c = tri[2];
        
    //     const area = Rasterizer.edgeRelation(a, b, c);
    
    //     const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x) / this.pixelSize));
    //     const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y) / this.pixelSize));
    //     const maxX = Math.min(this.width - 1, Math.floor(Math.max(a.x, b.x, c.x) / this.pixelSize));
    //     const maxY = Math.min(this.height - 1, Math.floor(Math.max(a.y, b.y, c.y) / this.pixelSize));
        
    
    //     for (let y = minY; y < maxY; y++) {
    //         for (let x = minX; x < maxX; x++) {
    //             const pt = {
    //                 x: (x + 0.5) * this.pixelSize,
    //                 y: (y + 0.5) * this.pixelSize
    //             };
    
    //             const ABP = Rasterizer.edgeRelation(a, b, pt); 
    //             const BCP = Rasterizer.edgeRelation(b, c, pt);
    //             const CAP = Rasterizer.edgeRelation(c, a, pt);
                
    //             if (area > 0 ? ABP >= 0 && BCP >= 0 && CAP >= 0 : ABP <= 0 && BCP <= 0 && CAP <= 0) {
    //                 this.setPixel(x, y, 255, 0, 0);
    //             }
    //         }
    //     }
    // }
    
    // raster() {
    //     this.clear();
        
        
    //     for (const tri of this.triangles) {
    //         this.drawTriangle(tri)
    //     }
        
    //     this.bufferCtx.putImageData(this.image, 0, 0);

    //     ctx.imageSmoothingEnabled = false;
    //     ctx.drawImage(this.bufferCanvas, 0, 0, canvas.width, canvas.height);
    // }
}

export const rasterizer = new Rasterizer(3);

class Point {
    constructor(options = {}) {
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        
        this.px = this.x;
        this.py = this.y;
        
        this.parent = null;
        this.locked = options.locked ?? false;
        this.active = options.active ?? true

        this.offsetX = 0;
        this.offsetY = 0;
        
    }
    
    update() {
        if (this.locked || this.grabbed || !this.active) return;

        if (this.parent) {
            this.x = this.parent.x + this.offsetX;
            this.y = this.parent.y + this.offsetY;

            this.px = this.x;
            this.py = this.y;

            return;
        }

        const damping = 0.85;
        const vx = (this.x - this.px) * damping;
        const vy = (this.y - this.py) * damping;

        this.px = this.x;
        this.py = this.y;

        this.x += vx;
        this.y += vy + GRAVITY;
    }
}

class Constraint {
    constructor(pt1, pt2, length, stiffness) {
        this.pt1 = pt1;
        this.pt2 = pt2;
        this.length = length;
        this.stiffness = stiffness;
    }
    
    update() {
        const dx = this.pt2.x - this.pt1.x;
        const dy = this.pt2.y - this.pt1.y;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const diff = this.length - dist;
        const ratio = diff / dist * this.stiffness
        
        const offX = dx * ratio;
        const offY = dy * ratio;
        
        if (!this.pt1.locked) {
            this.pt1.x -= offX;
            this.pt1.y -= offY;
        }
        
        if (!this.pt2.locked) {
            this.pt2.x += offX;
            this.pt2.y += offY
        }
    }
}

export class Fabric {
    
    constructor(options = {}) {
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        this.vx = options.vx ?? 0;
        this.vy = options.vy ?? 0;
        
        this.points = [];
        this.constraints = [];
        

        this.spacing = options.spacing

        this.stiffness = options.stiffness ?? 0.5;
        
        this.lockedTop = options.lockedTop ?? true;
        this.shapeMap = options.shapeMap ?? []
        
        this.cols = (this.shapeMap[0] ? this.shapeMap[0].length : (options.cols ?? 0));
        this.rows = this.shapeMap.length > 0 ? this.shapeMap.length : (options.rows ?? 0);
    }
    
    init() {
        if (this.shapeMap.length == 0) {
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    this.points.push(new Point({
                        x: this.x + x * this.spacing,
                        y: this.y + y * this.spacing,
                        locked: this.lockedTop && y == 0 && x % 5 == 0
                    }))
                }
            }
            
            
        }
        else {
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    const char = this.shapeMap[y][x];
                    
                    this.points.push(new Point({
                        x: this.x + x * this.spacing,
                        y: this.y + y * this.spacing,
                        locked: char == '2',
                        active: char != ' '
                    }))
                }
            }
        }
        
        // Add constraints
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const idx = y * this.cols + x;
                const currentPt = this.points[idx];

                if (x < this.cols - 1) {
                    const nextPt = this.points[y * this.cols + (x + 1)];
                    if (currentPt.active && nextPt.active) {
                        this.constraints.push(new Constraint(currentPt, nextPt, this.spacing, this.stiffness));
                    }
                }
                
                if (y < this.rows - 1) {
                    const nextPt = this.points[(y + 1) * this.cols + x];
                    if (currentPt.active && nextPt.active) {
                        this.constraints.push(new Constraint(currentPt, nextPt, this.spacing, this.stiffness));
                    }
                }
                
                
            }
        }
        
        // Add triangles
        for (let y = 0; y < this.rows - 1; y++) {
            for (let x = 0; x < this.cols - 1; x++) {
                const a = this.points[y * this.cols + x];
                const b = this.points[y * this.cols + x + 1];
                const c = this.points[(y + 1) * this.cols + x];
                const d = this.points[(y + 1) * this.cols + x + 1];
        
                if (a.active && b.active && c.active && d.active) {
                    rasterizer.addTriangle(a, b, c);
                    rasterizer.addTriangle(b, d, c);
                }
            }
        }
    }
    
    display() {
        ctx.strokeStyle = 'black';
        ctx.beginPath();
    
        for (const c of this.constraints) {
            ctx.moveTo(c.pt1.x, c.pt1.y);
            ctx.lineTo(c.pt2.x, c.pt2.y);
        }
    
        ctx.stroke();
    }
    
    update() {
        for (const p of this.points) {
            p.update();
        }
        
        for (let i = 0; i < 20; i++) {
            for (const c of this.constraints) {
                c.update();
            }
        }

        for (const p of this.points) {
            if (p.parent) {
                p.x = p.parent.x + p.offsetX;
                p.y = p.parent.y + p.offsetY;

                p.px = p.x;
                p.py = p.y;
            }
        }
    }
}

