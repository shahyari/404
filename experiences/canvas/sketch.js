/**
 * The pencil sketch: a 404 in outline with hatched shadows, drawn with
 * wobbly, doubled lines like a quick drawing.
 *
 * Everything is in artboard units and seeded, so the same sketch redraws
 * exactly at any resolution (on resize, and at double size for the download).
 */

const GRAPHITE = '45, 44, 50';

/** A small seeded random generator (mulberry32). */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the digits go, centred on a landscape or portrait sheet. */
function layout({ w, h }) {
  const portrait = h > w;
  const digitHeight = portrait ? 320 : 440;
  const widths = [0.72, 0.62, 0.72].map((r) => r * digitHeight);
  const gap = portrait ? 26 : 40;
  const total = widths.reduce((a, b) => a + b) + gap * 2;
  const top = (h - digitHeight) / 2;
  let x = (w - total) / 2;
  return ['4', '0', '4'].map((char, i) => {
    const box = { char, x, y: top, w: widths[i], h: digitHeight };
    x += widths[i] + gap;
    return box;
  });
}

/** The solid area of a digit, as a path (counters are holes with the even-odd rule). */
function digitPath({ char, x, y, w, h }) {
  const path = new Path2D();
  if (char === '0') {
    path.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    path.ellipse(x + w / 2, y + h / 2, w * 0.2, h * 0.31, 0, 0, Math.PI * 2);
    return path;
  }
  for (const polygon of fourPolygons({ x, y, w, h })) {
    polygon.forEach(([px, py], i) => (i ? path.lineTo(px, py) : path.moveTo(px, py)));
    path.closePath();
  }
  return path;
}

/** A blocky 4: its outline and the triangle inside it. */
function fourPolygons({ x, y, w, h }) {
  const at = (u, v) => [x + u * w, y + v * h];
  return [
    [at(0.56, 0), at(0.82, 0), at(0.82, 0.62), at(0.97, 0.62), at(0.97, 0.8), at(0.82, 0.8),
      at(0.82, 1), at(0.58, 1), at(0.58, 0.8), at(0.02, 0.8), at(0.02, 0.62)],
    [at(0.58, 0.27), at(0.58, 0.62), at(0.3, 0.62)],
  ];
}

export function drawSketch(ctx, art, scale, seed) {
  const rand = random(seed);
  const between = (a, b) => a + rand() * (b - a);
  const digits = layout(art);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pencil = (alpha, width) => {
    ctx.strokeStyle = `rgba(${GRAPHITE}, ${alpha})`;
    ctx.lineWidth = width;
  };

  /** One pencil line, drawn twice: slightly off, slightly bowed, overshooting its ends. */
  const line = (x1, y1, x2, y2, { passes = 2, wobble = 1.6, alpha = [0.55, 0.85], width = [1.3, 2.1] } = {}) => {
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const [dx, dy] = [(x2 - x1) / length, (y2 - y1) / length];
    for (let pass = 0; pass < passes; pass++) {
      const o1 = between(-2, 5);
      const o2 = between(-2, 5);
      const ax = x1 - dx * o1 + between(-wobble, wobble);
      const ay = y1 - dy * o1 + between(-wobble, wobble);
      const bx = x2 + dx * o2 + between(-wobble, wobble);
      const by = y2 + dy * o2 + between(-wobble, wobble);
      const bow = between(-1, 1) * Math.min(length * 0.012, 4);
      pencil(between(...alpha), between(...width));
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2 - dy * bow, (ay + by) / 2 + dx * bow, bx, by);
      ctx.stroke();
    }
  };

  const polygon = (points, options) => {
    points.forEach(([x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length];
      line(x, y, nx, ny, options);
    });
  };

  /** A closed curve, drawn twice, each pass starting somewhere else and running a little past its start. */
  const curve = (pointAt, { passes = 2, steps = 72, wobble = 1.4 } = {}) => {
    for (let pass = 0; pass < passes; pass++) {
      const start = rand();
      const overshoot = between(0.02, 0.06);
      const phase = rand() * Math.PI * 2;
      pencil(between(0.55, 0.85), between(1.3, 2.1));
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = start + (i / steps) * (1 + overshoot);
        const [x, y] = pointAt(t * Math.PI * 2);
        const drift = Math.sin(t * Math.PI * 4 + phase) * wobble;
        i ? ctx.lineTo(x + drift, y + drift) : ctx.moveTo(x + drift, y + drift);
      }
      ctx.stroke();
    }
  };

  const ellipse = (cx, cy, rx, ry) => curve((a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);

  // Faint guide lines, as if the letters were measured out first.
  const [first, , last] = digits;
  for (const y of [first.y, first.y + first.h]) {
    line(first.x - 40, y, last.x + last.w + 40, y, { passes: 1, alpha: [0.1, 0.16], width: [0.8, 1] });
  }

  // Hatched shadows, falling down and to the right of each digit.
  const shadow = document.createElement('canvas');
  shadow.width = ctx.canvas.width;
  shadow.height = ctx.canvas.height;
  const sctx = shadow.getContext('2d');
  sctx.setTransform(scale, 0, 0, scale, 0, 0);
  sctx.lineCap = 'round';
  for (const digit of digits) {
    const solid = digitPath(digit);
    const offset = new Path2D();
    offset.addPath(solid, new DOMMatrix().translate(14, 12));
    sctx.save();
    sctx.clip(offset, 'evenodd');
    for (let d = -digit.h; d < digit.w + digit.h; d += 7) {
      sctx.strokeStyle = `rgba(${GRAPHITE}, ${between(0.3, 0.5)})`;
      sctx.lineWidth = between(0.9, 1.3);
      sctx.beginPath();
      sctx.moveTo(digit.x + d + between(-1, 1), digit.y - 10);
      sctx.lineTo(digit.x + d - digit.h - 30 + between(-2, 2), digit.y + digit.h + 20);
      sctx.stroke();
    }
    sctx.restore();
    sctx.globalCompositeOperation = 'destination-out';
    sctx.fill(solid, 'evenodd');
    sctx.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(shadow, 0, 0);
  ctx.restore();

  // The digits.
  for (const digit of digits) {
    if (digit.char === '0') {
      const cx = digit.x + digit.w / 2;
      const cy = digit.y + digit.h / 2;
      ellipse(cx, cy, digit.w / 2, digit.h / 2);
      ellipse(cx, cy, digit.w * 0.2, digit.h * 0.31);
    } else {
      for (const points of fourPolygons(digit)) polygon(points);
    }
  }

  // Graphite grain: rub a little of every line away.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat');
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas');
  grainTile.width = grainTile.height = 128;
  const gctx = grainTile.getContext('2d');
  const image = gctx.createImageData(128, 128);
  for (let i = 0; i < image.data.length; i += 4) image.data[i + 3] = Math.random() ** 2 * 140;
  gctx.putImageData(image, 0, 0);
  return grainTile;
}
