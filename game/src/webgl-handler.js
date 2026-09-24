class GLContext {
    constructor(canvas, attribs) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl2", attribs);
        const ext = this.gl.getExtension("EXT_color_buffer_float");

        if (!ext) {
            //Check for support cause people have POTATOS
            console.warn(
                "EXT_color_buffer_float unavailable; RGBA16F render targets may not be renderable."
            );
        }
        if (!this.gl) console.log("WebGL2 not supported");
    }
    createProgram(options) {
        return new Program(this.gl, options);
    }
    createMesh(options) {
        return new Mesh(this.gl, options);
    }
    createTexture(source, options = {}) {
        return new Texture(this.gl, source, options);
    }
    createRenderTarget(options = {}) {
        return new RenderTarget(this.gl, options);
    }
    createPostProcess(shaders) {
        return new PostProcess(this.gl, this.createProgram(shaders));
    }
}
class Program {
    constructor(gl, { vertex, fragment }) {
        this.gl = gl;
        const vs = this.compile(gl.VERTEX_SHADER, vertex);
        const fs = this.compile(gl.FRAGMENT_SHADER, fragment);
        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            console.log(gl.getProgramInfoLog(this.program));
        this.uniforms = new Map();
    }
    compile(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            console.log(gl.getShaderInfoLog(shader));
        return shader;
    }
    use() {
        this.gl.useProgram(this.program);
    }
    uniform(name) {
        if (this.uniforms.has(name)) {
            return this.uniforms.get(name);
        }
        const loc = this.gl.getUniformLocation(this.program, name);
        this.uniforms.set(name, loc);
        return loc;
    }
}
class Mesh {
    constructor(gl, options = {}) {
        this.gl = gl;
        this.vao = gl.createVertexArray();
        this.attributes = {};
        this.buffers = {};
        this.vertexCount = 0;
        this.indexCount = 0;
        gl.bindVertexArray(this.vao);
        let location = 0;
        for (const [name, attribute] of Object.entries(options.attributes || {})) {
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            const data = attribute.data || [];
            if (!this.vertexCount && data.length) {
                this.vertexCount = data.length / attribute.size;
            }
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array(data),
                options.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW,
            );
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(
                location,
                attribute.size,
                attribute.type || gl.FLOAT,
                attribute.normalized || false,
                attribute.stride || 0,
                attribute.offset || 0,
            );
            this.attributes[name] = { location, size: attribute.size };
            this.buffers[name] = buffer;
            location++;
        }
        if (options.indices) {
            this.indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
            gl.bufferData(
                gl.ELEMENT_ARRAY_BUFFER,
                new Uint32Array(options.indices),
                options.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW,
            );
            this.indexCount = options.indices.length;
        }
        gl.bindVertexArray(null);

    }
    setAttribute(name, data) {
        const gl = this.gl;
        const buffer = this.buffers[name];
        if (!buffer) {
            console.log(`Unknown attribute '${name}'`);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        this.vertexCount = data.length / this.attributes[name].size;
    }
    draw(mode = this.gl.TRIANGLES) {
        const gl = this.gl;
        gl.bindVertexArray(this.vao);
        if (this.indexCount > 0) {
            gl.drawElements(mode, this.indexCount, gl.UNSIGNED_INT, 0);
        } else {
            gl.drawArrays(mode, 0, this.vertexCount);
        }
    }
}
class Texture {
    constructor(gl, image, options = {}) {
        this.gl = gl;
        this.mipmapped = options.mipmap;
        this.texture = gl.createTexture();
        this.image;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            options.minFilter || gl.LINEAR,
        );
        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MAG_FILTER,
            options.magFilter || gl.LINEAR,
        );
        if (this.mipmapped) {
            gl.generateMipmap(gl.TEXTURE_2D);
        }
    }
    bind(unit = 0) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }

    async setImage(source, level = 0) {
        const gl = this.gl;

        let image = source;

        if (typeof source === "string") {
            image = await toBitmap(source);
        }

        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        gl.texImage2D(
            gl.TEXTURE_2D,
            level,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image,
        );

        //  if(this.mipmapped) {
        //gl.generateMipmap(gl.TEXTURE_2D);
        //}

        this.width = image.width;
        this.height = image.height;

        return image;
    }
}
class RenderTarget {
    constructor(
        gl,
        options,
        { width = gl.canvas.width, height = gl.canvas.height } = {},
    ) {
        this.gl = gl;
        this.width = width;
        this.height = height;
        this.framebuffer = gl.createFramebuffer();
        this.texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        const internalFormat = options.format || gl.RGBA16F;
        const type =
            internalFormat == gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            internalFormat,
            width,
            height,
            0,
            gl.RGBA,
            type,
            null,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            this.texture,
            0,
        );
        this.depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
        gl.renderbufferStorage(
            gl.RENDERBUFFER,
            gl.DEPTH_COMPONENT24,
            width,
            height,
        );
        gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER,
            this.depthBuffer,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    bind() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        //if(this.mipmapped){
        //gl.generateMipmap(gl.TEXTURE_2D); 
        //}
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }
    unbind() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
}
class PostProcess {
    constructor(gl, program) {
        this.gl = gl;
        this.program = program;
        this.iChannel = this.program.uniform("iChannel0");
        this.iChannel1 = this.program.uniform("iChannel1");
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
        const loc = 0;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }
    render(source, target = null, extra = null) {
        const gl = this.gl;
        if (target) {
            target.bind();
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        this.program.use();
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, source.texture);
        gl.uniform1i(this.iChannel, 8);
        if (extra) {
            gl.activeTexture(gl.TEXTURE9);
            gl.bindTexture(gl.TEXTURE_2D, extra.texture);
            gl.uniform1i(this.iChannel1, 9);
        }
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}
class GLParticles {
    constructor(gl, maxGLParticles = 100000) {
        this.gl = gl;
        this.count = 0;
        this.data = new Float32Array(maxGLParticles * 7);

        this.vao = gl.createVertexArray();
        this.buffer = gl.createBuffer();

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

        gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 7 * 4, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 7 * 4, 3 * 4);
        gl.bindVertexArray(null);
    }
    clear() {
        this.count = 0;
    }
    add(x, y, z, r, g, b, a) {
        const i = (this.count * 7) % this.data.length;
        this.data[i + 0] = x;
        this.data[i + 1] = y;
        this.data[i + 2] = z;
        this.data[i + 3] = r;
        this.data[i + 4] = g;
        this.data[i + 5] = b;
        this.data[i + 6] = a;
        this.count++;
    }
    draw() {
        const gl = this.gl;
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * 7));
        gl.drawArrays(gl.POINTS, 0, this.count);
    }
}

export class GraphicsUberCompositor {
    constructor(canvas, options = {}) {
        this.canvas = canvas;

        this.glctx = new GLContext(canvas, {
            alpha: false,
            antialias: false,
            ...options.contextAttributes
        });

        this.gl = this.glctx.gl;

        this.width = options.width || canvas.width;
        this.height = options.height || canvas.height;

        canvas.width = this.width;
        canvas.height = this.height;

        this.layers = [];

        this.targetA = this.glctx.createRenderTarget({
            width: this.width,
            height: this.height,
            format: this.gl.RGBA16F
        });

        this.targetB = this.glctx.createRenderTarget({
            width: this.width,
            height: this.height,
            format: this.gl.RGBA16F
        });

        this.quad = this.createQuad();

        //Shader that does all the lighting and magic
        this.layerShader = this.glctx.createProgram({
            vertex: `#version 300 es

        layout(location=0) in vec2 a_position;

        out vec2 v_uv;

        void main() {
          v_uv = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `,

            fragment: `#version 300 es
        precision highp float;

        in vec2 v_uv;
        out vec4 outColor;

        uniform sampler2D u_texture;
        uniform float u_opacity;

        struct Light {
          vec4 position;
          vec4 direction;
          vec4 color;
          vec4 params;
        };
        
        uniform Light u_lights[32];
        uniform int u_lightCount;

        void main() {
          vec4 tex = texture(u_texture, v_uv);

          vec3 lighting = vec3(0.0);

          for (int i = 0; i < 32; i++) {
            if (i >= u_lightCount)
              break;

            Light light = u_lights[i];

            int type = int(light.params.x);

            //Add ambient light
            if (type == 0) {
              lighting +=
                light.color.rgb *
                light.color.a;
            }

            //"Point" lights which are pretty fuzzy but that's called style!
            else if (type == 1) {
              vec2 delta =
                light.position.xy -
                gl_FragCoord.xy;

              float distance = length(delta);

              float radius = light.params.y;

              float attenuation =
                0.2/((distance*distance)/(radius*radius)+0.1);

              lighting +=
                light.color.rgb *
                light.color.a *
                attenuation;
            }

            //Spotlight Need to tune this
            else if (type == 2) {
              vec2 delta =
                gl_FragCoord.xy -
                light.position.xy;

              float distance = length(delta);

              vec2 dir = normalize(delta);

              vec2 spotDir =
                normalize(light.direction.xy);

              float angle =
                dot(dir, spotDir);

              float cone =
                smoothstep(
                  light.params.w,
                  light.params.z,
                  angle
                );

              float attenuation =
                1.0 -
                smoothstep(
                  0.0,
                  light.params.y,
                  distance
                );

              lighting +=
                light.color.rgb *
                light.color.a *
                cone *
                attenuation;
            }
          }

          vec3 color =
            (tex.rgb+0.01) * (lighting);

          outColor = vec4(
            color,
            tex.a * u_opacity
          );
        }
      `
        });

        //Compositor for after al the stuff
        this.composite = this.glctx.createProgram({
            vertex: `#version 300 es

        layout(location=0) in vec2 a_position;

        out vec2 v_uv;

        void main() {
          v_uv = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `,

            fragment: `#version 300 es
        precision highp float;

        in vec2 v_uv;
        out vec4 outColor;

        uniform sampler2D u_texture;
        // Narkowicz 2015, "ACES Filmic Tone Mapping Curve"
vec3 ACES(vec3 x)
{
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59; 
    const float e = 0.14;
    return (x * (a * x + b)) / (x * (c * x + d) + e);
}
        void main() {
          outColor=vec4(1.0);
          outColor.rgb = ACES(texture(u_texture, v_uv).rgb);
          outColor.a=1.0;
        } 
      `
        });

        this.gl.disable(this.gl.DEPTH_TEST);
    }

    createQuad() {
        const gl = this.gl;

        const vao = gl.createVertexArray();
        const buffer = gl.createBuffer();

        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -1, -1,
                3, -1,
                -1, 3 
            ]),
            gl.STATIC_DRAW
        );

        gl.enableVertexAttribArray(0);

        gl.vertexAttribPointer(
            0,
            2,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.bindVertexArray(null);

        return vao;
    }

    addLayer(canvas, options = {}) {
        const layer = new GraphicsLayerObject(
            this,
            canvas,
            options
        );

        this.layers.push(layer);

        return layer;
    }

    render() {
  this.updateTextures();


  this.targetA.bind();

  const gl = this.gl;

  gl.viewport(0, 0, this.width, this.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  for (const layer of this.layers) {
    if (!layer.visible) continue;
    this.renderLayer(layer);
  }

  this.targetA.unbind();


  this.drawToScreen(this.targetA);
}

    updateTextures() {
        const gl = this.gl;

        for (const layer of this.layers) {
            if (!layer.visible)
                continue;

            gl.bindTexture(
                gl.TEXTURE_2D,
                layer.texture.texture
            );

            gl.pixelStorei(
                gl.UNPACK_FLIP_Y_WEBGL,
                true
            );

            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                layer.canvas
            );
        }
    }

    renderLayer(layer) {
        const gl = this.gl;
        const program = layer.shader;

        program.use();

        //Canvas texture bind
        layer.texture.bind(0);

        gl.uniform1i(
            program.uniform("u_texture"),
            0
        );

        //Have some global opacity just in case, seems useful
        const opacity = program.uniform("u_opacity");

        if (opacity !== null) {
            gl.uniform1f(
                opacity,
                layer.opacity
            );
        }

        //LIGHT IT UP YEAHHHHHH
        this.uploadLights(layer);
        

        gl.bindVertexArray(this.quad);

        gl.drawArrays(
            gl.TRIANGLES,
            0,
            3
        );

        gl.disable(gl.BLEND);
    }

    uploadLights(layer) {
        const gl = this.gl;
        const program = layer.shader;

        const count = Math.min(
            layer.lights.length,
            32
        );

        const lightCount =
            program.uniform("u_lightCount");

        if (lightCount !== null) {
            gl.uniform1i(
                lightCount,
                count
            );
        }

        for (let i = 0; i < count; i++) {
            const light = layer.lights[i];

            const prefix =
                `u_lights[${i}]`;

            const position =
                program.uniform(
                    `${prefix}.position`
                );

            const direction =
                program.uniform(
                    `${prefix}.direction`
                );

            const color =
                program.uniform(
                    `${prefix}.color`
                );

            const params =
                program.uniform(
                    `${prefix}.params`
                );

            if (position !== null) {
                gl.uniform4f(
                    position,
                    light.x,
                    light.y,
                    light.z,
                    1
                );
            }

            if (direction !== null) {
                gl.uniform4f(
                    direction,
                    light.dx,
                    light.dy,
                    light.dz,
                    0
                );
            }

            if (color !== null) {
                gl.uniform4f(
                    color,
                    light.color[0],
                    light.color[1],
                    light.color[2],
                    light.intensity
                );
            }

             const types = { ambient: 0, point: 1, spot: 2 };
            const type = types[light.type] ?? 1;

            if (params !== null) {
                gl.uniform4f(
                    params,
                    type,
                    light.radius,
                    light.innerCone,
                    light.outerCone
                );
            }
        } 
    }

    drawToScreen(source) {
  const gl = this.gl;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, this.canvas.width, this.canvas.height);

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  this.composite.use();

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, source.texture);

  const texture = this.composite.uniform("u_texture");
  if (texture !== null) {
    gl.uniform1i(texture, 0);
  }

  const resolution = this.composite.uniform("u_resolution");
  if (resolution !== null) {
    gl.uniform2f(resolution, this.width, this.height);
  }

  gl.bindVertexArray(this.quad);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}
}
class GraphicsLayerObject {
    constructor(graphics, canvas, options = {}) {
        this.graphics = graphics;
        this.gl = graphics.gl;

        this.canvas = canvas;

        this.texture =
            graphics.glctx.createTexture(
                canvas,
                {
                    minFilter: this.gl.LINEAR,
                    magFilter: this.gl.LINEAR
                }
            );

        this.opacity =
            options.opacity ?? 1;

        this.blend =
            options.blend ?? "normal";

        this.visible =
            options.visible ?? true;

        this.shader =
            options.shader ??
            graphics.layerShader;

        this.lights = [];
    }

    setShader(shader) {
        this.shader = shader;
        return this;
    }

    addLight(options = {}) {
        const light = {
            type:options.type ?? "point",
            x:options.x ?? 0,
            y:options.y ?? 0,
            z:options.z ?? 0,
            dx:options.dx ?? 0,
            dy:options.dy ?? -1,
            dz:options.dz ?? 0,
            radius:options.radius ?? 100,
            innerCone:options.innerCone ?? 0.9,
            outerCone:options.outerCone ?? 0.5,
            color:options.color ?? [1, 1, 1],
            intensity:options.intensity ?? 1
        }; //Big block of code so beautiful could bring you to tears

        this.lights.push(light);

        return light;
    }

    removeLight(light) {
        const index =
            this.lights.indexOf(light);

        if (index !== -1) {
            this.lights.splice(
                index,
                1
            );
        }
    }

    clearLights() {
        this.lights.length = 0;
    }
}