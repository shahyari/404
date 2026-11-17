/**
 * The paper: a warm sheet with soft mottling, a fine tooth and a few faint
 * fibers. Seeded and drawn in artboard units like the sketch, so it looks the
 * same on screen and in the download.
 */

function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small canvas of random light and dark specks, to stretch or tile. */
function noise(rand, width, height, alpha) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const dark = rand() < 0.5;
    // Dark specks are a warm brown, not gray, so the paper stays cream.
    image.data[i] = dark ? 125 : 255;
    image.data[i + 1] = dark ? 105 : 255;
    image.data[i + 2] = dark ? 75 : 250;
    image.data[i + 3] = rand() * alpha;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function drawPaper(ctx, art, scale, seed, color) {
  const rand = random(seed ^ 0x9e3779b9);
  const { width, height } = ctx.canvas;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  // Mottling: a coarse noise stretched smooth across the sheet, twice.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(noise(rand, 24, 16, 22), 0, 0, width, height);
  ctx.drawImage(noise(rand, 90, 60, 16), 0, 0, width, height);

  // Tooth: fine specks, tiled at about one artboard unit each.
  const tooth = noise(rand, 160, 160, 26);
  const step = Math.max(1, scale);
  const pattern = ctx.createPattern(tooth, 'repeat');
  pattern.setTransform(new DOMMatrix().scale(step));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);

  // Fibers: short, faint, curved strands.
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = 'round';
  const count = Math.round((art.w * art.h) / 2500);
  for (let i = 0; i < count; i++) {
    const x = rand() * art.w;
    const y = rand() * art.h;
    const length = 8 + rand() * 30;
    const angle = rand() * Math.PI * 2;
    const bend = (rand() - 0.5) * length * 0.6;
    const ex = x + Math.cos(angle) * length;
    const ey = y + Math.sin(angle) * length;
    ctx.strokeStyle = rand() < 0.7 ? `rgba(120, 100, 75, ${0.05 + rand() * 0.07})` : `rgba(255, 255, 255, ${0.2 + rand() * 0.2})`;
    ctx.lineWidth = 0.4 + rand() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(angle) * bend, (y + ey) / 2 + Math.cos(angle) * bend, ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}
