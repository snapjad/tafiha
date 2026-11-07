// طفّيها — smoke drifting through the main buttons (the red ones, the welcome button and «عندي رغبة»).
// Adapted from the «Smoky Button» shader, in the brand colours.
//
// One small WebGL canvas draws the smoke; every visible button copies it into its own 2D canvas.
// So there's a single GPU context however many buttons the screen has (browsers allow ~16), and
// nothing runs while no smoky button is on screen or the app is in the background.
// Reduced motion: one still frame. No WebGL: plain buttons.

const HOSTS = '.btn-red, .intro-btn:not(.line), .sos-core';
const W = 256, H = 80; // the smoke's own size; buttons stretch it
const FPS = 30;
const COLORS = [[0xE1, 0x26, 0x1C], [0xE5, 0xA5, 0x48], [0x1B, 0x17, 0x16]].map((c) => c.map((v) => v / 255));

const VERTEX = `
  attribute vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT = `
  precision mediump float;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uShadow;

  float random(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = random(i), b = random(i + vec2(1.0, 0.0)), c = random(i + vec2(0.0, 1.0)), d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0, amp = 0.5;
    mat2 rot = mat2(0.8776, 0.4794, -0.4794, 0.8776);
    for (int i = 0; i < 6; i++) { v += amp * noise(p); p = rot * p * 2.04 + vec2(13.7, 9.2); amp *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec2 pos = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
    float t = uTime * 0.58;

    vec2 silk = pos;
    silk.y += 0.20 * sin(pos.x * 1.55 - t * 1.8) + 0.11 * sin(pos.x * 3.2 + t * 1.35);
    silk.x += 0.06 * sin(pos.y * 4.2 - t * 1.1);
    vec2 warp = vec2(fbm(silk * 1.15 + vec2(t * 0.28, -t * 0.17)), fbm(silk * 1.05 + vec2(4.8, 1.3) - vec2(t * 0.18, t * 0.22)));
    vec2 cur = silk + (warp - 0.5) * 0.82;
    float body = fbm(cur * 1.35 + vec2(-t * 0.24, t * 0.14));
    float detail = fbm(cur * 2.7 + vec2(t * 0.31, -t * 0.27));
    float p1 = fbm(cur * 1.20 + vec2(-t * 0.38, t * 0.18));
    float p2 = fbm(cur * 1.10 + vec2(t * 0.26, -t * 0.32) + vec2(7.2, 3.6));
    float p3 = fbm(cur * 1.45 + vec2(-t * 0.18, t * 0.42) + vec2(2.4, 8.1));

    float flow = cur.y * 6.8 + cur.x * 1.35 + (warp.x - warp.y) * 5.2;
    float cross = cur.y * 5.4 - cur.x * 2.1 + (warp.x + warp.y) * 3.5;
    float r1 = smoothstep(0.08, 0.92, 0.5 + 0.5 * sin(flow - t * 2.75));
    float r2 = smoothstep(0.08, 0.92, 0.5 + 0.5 * sin(cross + t * 2.35 + 2.1));
    float r3 = smoothstep(0.12, 0.88, 0.5 + 0.5 * sin(flow * 0.78 - cross * 0.22 - t * 3.25 + 4.2));

    float w1 = smoothstep(0.27, 0.76, p1 + 0.24 * body) * (0.20 + 1.08 * r1);
    float w2 = smoothstep(0.26, 0.74, p2 + 0.22 * body) * (0.22 + 1.04 * r2 + 0.12 * detail);
    float w3 = 0.16 + smoothstep(0.32, 0.80, p3 + 0.14 * body) * (0.22 + 0.86 * r3);
    vec3 color = (uPrimary * w1 + uSecondary * w2 + uShadow * w3) / max(w1 + w2 + w3, 0.001);

    float depth = smoothstep(0.15, 0.88, body * 0.78 + detail * 0.30);
    color *= 0.65 + depth * 0.62;
    color = mix(color, uShadow, smoothstep(0.46, 0.80, p3 + 0.10 * body + 0.16 * r3) * (0.12 + 0.42 * r3));
    float sheen = pow(0.5 + 0.5 * sin(flow * 1.22 - t * 3.2 + detail * 2.0), 6.0);
    color += mix(uSecondary, uPrimary, r1) * sheen * (0.10 + 0.16 * depth);

    // thick at the start of the button (right, in Arabic), thinning into the button's own red
    float feather = uv.x + 0.12 * (body - 0.5) + 0.04 * sin(cur.y * 3.0 - t * 1.4);
    float alpha = smoothstep(0.18, 0.78, feather) * 0.9;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
  }
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

function renderer() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program');
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, 'aPosition');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  gl.viewport(0, 0, W, H);
  gl.uniform2f(u('uResolution'), W, H);
  gl.uniform3f(u('uPrimary'), ...COLORS[0]);
  gl.uniform3f(u('uSecondary'), ...COLORS[1]);
  gl.uniform3f(u('uShadow'), ...COLORS[2]);
  const time = u('uTime');
  return {
    canvas,
    draw(seconds) {
      gl.uniform1f(time, seconds);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

let smoke = null;
const visible = new Set();
const seen = new WeakSet();
let frame = 0, last = 0;
const started = performance.now();
const still = matchMedia('(prefers-reduced-motion: reduce)');

// copies the current smoke into one button, sized to it
function paint(host) {
  const c = host.querySelector(':scope > canvas.smoky');
  if (!c) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(c.clientWidth * ratio)), h = Math.max(1, Math.round(c.clientHeight * ratio));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(smoke.canvas, 0, 0, w, h);
}

function tick(now) {
  frame = 0;
  if (document.hidden || !visible.size) return;
  if (now - last >= 1000 / FPS) {
    last = now;
    smoke.draw((now - started) / 1000);
    for (const host of visible) host.isConnected ? paint(host) : visible.delete(host);
  }
  frame = requestAnimationFrame(tick);
}

function run() {
  if (still.matches) {
    smoke.draw(7.3); // a nice still frame
    visible.forEach(paint);
  } else if (!frame && visible.size && !document.hidden) frame = requestAnimationFrame(tick);
}

const watch = new IntersectionObserver((entries) => {
  for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
  run();
});

function addCanvas(host) {
  const c = document.createElement('canvas');
  c.className = 'smoky';
  c.setAttribute('aria-hidden', 'true');
  host.classList.add('smoky-host');
  host.prepend(c);
}

function adopt(root) {
  const found = root.matches?.(HOSTS) ? [root] : [];
  if (root.querySelectorAll) found.push(...root.querySelectorAll(HOSTS));
  for (const host of found) {
    if (seen.has(host)) continue;
    seen.add(host);
    addCanvas(host);
    watch.observe(host);
  }
}

try { smoke = renderer(); } catch { smoke = null; }
if (smoke) {
  adopt(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) if (n.nodeType === 1) adopt(n);
      // a label set with textContent wipes the canvas out of its button: put it back
      const host = m.target;
      if (host.classList?.contains('smoky-host') && !host.querySelector(':scope > canvas.smoky')) {
        addCanvas(host);
        if (visible.has(host)) run();
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', run);
  still.addEventListener?.('change', run);
}
