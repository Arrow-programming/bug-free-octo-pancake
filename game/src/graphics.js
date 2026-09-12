/**
 * Overarching Graphics classes for storing the canvas for use across files
 */

class Graphics {
    constructor() {
        this.canvas = null;
        this.ctx = null;
    }

    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;

    }
}

export const graphics = new Graphics();

class Rasterizer {
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
        
        graphics.ctx.beginPath();
        
        // Get the min/max so you dont have to loop through the whole canvas
        const minX = Math.max(0, Math.floor(Math.min(tri[0].x, tri[1].x, tri[2].x) / this.pixelSize) * this.pixelSize);
        const minY = Math.max(0, Math.floor(Math.min(tri[0].y, tri[1].y, tri[2].y) / this.pixelSize) * this.pixelSize);
        const maxX = Math.min(graphics.canvas.width, Math.ceil(Math.max(tri[0].x, tri[1].x, tri[2].x) / this.pixelSize) * this.pixelSize);
        const maxY = Math.min(graphics.canvas.height, Math.ceil(Math.max(tri[0].y, tri[1].y, tri[2].y) / this.pixelSize) * this.pixelSize);
        

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
                    graphics.ctx.fillStyle = ABP >= -0.1 && BCP >= -0.1 && CAP >= -0.1 ? 'red' : 'orange';
                    graphics.ctx.fillRect(Math.floor(pt.x), Math.floor(pt.y), this.pixelSize, this.pixelSize);
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