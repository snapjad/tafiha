// طفّيها — cigarette smoke as a small stable-fluids simulation on the GPU.
// A thin plume is injected at the tip every frame; buoyancy lifts it and
// vorticity confinement breaks it into the curls real smoke makes.

const VERT = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv, vL, vR, vT, vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const HEAD = `precision highp float;
precision highp sampler2D;
varying vec2 vUv, vL, vR, vT, vB;
`;

const SPLAT = `${HEAD}
uniform sampler2D uTarget;
uniform float aspectRatio, radius;
uniform vec3 color;
uniform vec2 point;
void main () {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 s = exp(-dot(p, p) / radius) * color;
  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + s, 1.0);
}`;

const ADVECT = `${HEAD}
uniform sampler2D uVelocity, uSource;
uniform vec2 texelSize;
uniform float dt, dissipation;
void main () {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  gl_FragColor = texture2D(uSource, coord) / (1.0 + dissipation * dt);
}`;

// open at the top and sides so smoke leaves the frame; a floor at the bottom
const DIVERGENCE = `${HEAD}
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  if (vB.y < 0.0) { B = -texture2D(uVelocity, vUv).y; }
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const CURL = `${HEAD}
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = `${HEAD}
uniform sampler2D uVelocity, uCurl;
uniform float curl, dt;
void main () {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 v = texture2D(uVelocity, vUv).xy + force * dt;
  gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`;

const BUOYANCY = `${HEAD}
uniform sampler2D uVelocity, uDye;
uniform float buoyancy, dt;
void main () {
  vec2 v = texture2D(uVelocity, vUv).xy;
  v.y += buoyancy * texture2D(uDye, vUv).r * dt;
  gl_FragColor = vec4(v, 0.0, 1.0);
}`;

const PRESSURE = `${HEAD}
uniform sampler2D uPressure, uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float div = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = `${HEAD}
uniform sampler2D uPressure, uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
  gl_FragColor = vec4(v, 0.0, 1.0);
}`;

const CLEAR = `${HEAD}
uniform sampler2D uTexture;
uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`;

// premultiplied grey-blue smoke, fading out before it reaches the edges
const DISPLAY = `${HEAD}
uniform sampler2D uTexture;
uniform vec3 tint;
uniform float opacity;
void main () {
  float d = max(texture2D(uTexture, vUv).r, 0.0);
  float a = (1.0 - exp(-d * 1.7)) * opacity;
  a *= smoothstep(1.0, 0.7, vUv.y) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  vec3 c = mix(tint, tint * 0.82, clamp(d * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(c * a, a);
}`;

function supportsRender(gl, internal, format, type) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  gl.deleteTexture(tex);
  return ok;
}

export function createSmoke(canvas, opts = {}) {
  const P = {
    simRes: opts.small ? 96 : 128,
    dyeRes: opts.small ? 320 : 512,
    velDiss: 0.25,
    dyeDiss: 0.45,
    pressure: 0.8,
    iters: 20,
    curl: 14,
    buoyancy: 38,
    tint: [0.50, 0.53, 0.58],
    opacity: 0.85,
  };
  const attrs = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true };
  let gl = canvas.getContext('webgl2', attrs);
  const gl2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', attrs);
  if (!gl) return null;

  let type, internal;
  const format = gl.RGBA;
  if (gl2) {
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
    type = gl.HALF_FLOAT;
    internal = gl.RGBA16F;
  } else {
    const hf = gl.getExtension('OES_texture_half_float');
    if (!hf || !gl.getExtension('OES_texture_half_float_linear')) return null;
    type = hf.HALF_FLOAT_OES;
    internal = gl.RGBA;
  }
  if (!supportsRender(gl, internal, format, type)) return null;

  const compile = (kind, src) => {
    const s = gl.createShader(kind);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const program = (fsrc) => {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsrc));
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { u, bind: () => gl.useProgram(p) };
  };

  const splatP = program(SPLAT);
  const advectP = program(ADVECT);
  const divP = program(DIVERGENCE);
  const curlP = program(CURL);
  const vortP = program(VORTICITY);
  const buoyP = program(BUOYANCY);
  const pressP = program(PRESSURE);
  const gradP = program(GRADIENT);
  const clearP = program(CLEAR);
  const showP = program(DISPLAY);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  gl.disable(gl.BLEND);

  const makeFBO = (w, h) => {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      tex, fb, w, h, tx: 1 / w, ty: 1 / h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; },
      free() { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); },
    };
  };
  const makeDouble = (w, h) => {
    let a = makeFBO(w, h);
    let b = makeFBO(w, h);
    return {
      get read() { return a; },
      get write() { return b; },
      swap() { const t = a; a = b; b = t; },
      free() { a.free(); b.free(); },
    };
  };

  let velocity, dye, pressure, divergence, curl;
  const grid = (r) => {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const lo = Math.round(r);
    const hi = Math.round(r * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? [hi, lo] : [lo, hi];
  };
  const alloc = () => {
    [velocity, dye, pressure].forEach((d) => d?.free());
    [divergence, curl].forEach((d) => d?.free());
    const [sw, sh] = grid(P.simRes);
    const [dw, dh] = grid(P.dyeRes);
    velocity = makeDouble(sw, sh);
    pressure = makeDouble(sw, sh);
    divergence = makeFBO(sw, sh);
    curl = makeFBO(sw, sh);
    dye = makeDouble(dw, dh);
  };

  const blit = (t) => {
    if (t) {
      gl.viewport(0, 0, t.w, t.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };

  let dirty = true;
  new ResizeObserver(() => { dirty = true; }).observe(canvas);
  function resize() {
    dirty = false;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h || !velocity) {
      canvas.width = w;
      canvas.height = h;
      alloc();
    }
  }

  function splat(x, y, vx, vy, amount, radius) {
    let rad = radius;
    const aspect = canvas.width / canvas.height;
    if (aspect > 1) rad *= aspect;
    splatP.bind();
    gl.uniform1f(splatP.u.aspectRatio, aspect);
    gl.uniform2f(splatP.u.point, x, y);
    gl.uniform1f(splatP.u.radius, rad);
    gl.uniform1i(splatP.u.uTarget, velocity.read.attach(0));
    gl.uniform3f(splatP.u.color, vx, vy, 0);
    blit(velocity.write);
    velocity.swap();
    gl.uniform1i(splatP.u.uTarget, dye.read.attach(0));
    gl.uniform3f(splatP.u.color, amount, 0, 0);
    blit(dye.write);
    dye.swap();
  }

  function step(dt) {
    const tx = velocity.read.tx;
    const ty = velocity.read.ty;

    curlP.bind();
    gl.uniform2f(curlP.u.texelSize, tx, ty);
    gl.uniform1i(curlP.u.uVelocity, velocity.read.attach(0));
    blit(curl);

    vortP.bind();
    gl.uniform2f(vortP.u.texelSize, tx, ty);
    gl.uniform1i(vortP.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vortP.u.uCurl, curl.attach(1));
    gl.uniform1f(vortP.u.curl, P.curl);
    gl.uniform1f(vortP.u.dt, dt);
    blit(velocity.write);
    velocity.swap();

    buoyP.bind();
    gl.uniform1i(buoyP.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(buoyP.u.uDye, dye.read.attach(1));
    gl.uniform1f(buoyP.u.buoyancy, P.buoyancy);
    gl.uniform1f(buoyP.u.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divP.bind();
    gl.uniform2f(divP.u.texelSize, tx, ty);
    gl.uniform1i(divP.u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearP.bind();
    gl.uniform1i(clearP.u.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearP.u.value, P.pressure);
    blit(pressure.write);
    pressure.swap();

    pressP.bind();
    gl.uniform2f(pressP.u.texelSize, tx, ty);
    gl.uniform1i(pressP.u.uDivergence, divergence.attach(0));
    for (let i = 0; i < P.iters; i++) {
      gl.uniform1i(pressP.u.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradP.bind();
    gl.uniform2f(gradP.u.texelSize, tx, ty);
    gl.uniform1i(gradP.u.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradP.u.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectP.bind();
    gl.uniform2f(advectP.u.texelSize, tx, ty);
    const vId = velocity.read.attach(0);
    gl.uniform1i(advectP.u.uVelocity, vId);
    gl.uniform1i(advectP.u.uSource, vId);
    gl.uniform1f(advectP.u.dt, dt);
    gl.uniform1f(advectP.u.dissipation, P.velDiss);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(advectP.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectP.u.uSource, dye.read.attach(1));
    gl.uniform1f(advectP.u.dissipation, P.dyeDiss);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    showP.bind();
    gl.uniform1i(showP.u.uTexture, dye.read.attach(0));
    gl.uniform3f(showP.u.tint, ...P.tint);
    gl.uniform1f(showP.u.opacity, P.opacity);
    blit(null);
  }

  resize();
  return {
    params: P,
    resize,
    // emitters: [{ x, y (0..1, y up), vx, vy (texels/s), amount, radius }]
    frame(dt, emitters) {
      if (dirty) resize();
      for (const e of emitters) splat(e.x, e.y, e.vx, e.vy, e.amount, e.radius);
      step(dt);
      render();
    },
    // lighter settings for slow devices; returns false once at the floor
    degrade() {
      if (P.dyeRes <= 256) return false;
      P.dyeRes = 256;
      P.simRes = 80;
      P.iters = 12;
      alloc();
      return true;
    },
    clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
  };
}
