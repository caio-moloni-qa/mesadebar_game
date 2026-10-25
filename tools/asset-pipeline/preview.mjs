// Software z-buffer preview of a processed (vertex-coloured, unindexed) GLB: draws an orthographic view to a PPM
// image (convert to PNG with PIL). Lets us look at a mesh without a browser.
// Usage: node preview.mjs <in.glb> <out.ppm> <front|side|back> [size]
import { NodeIO } from '@gltf-transform/core';
import { clearNodeTransform } from '@gltf-transform/functions';
import { writeFileSync } from 'node:fs';

const [input, output, view = 'front', sizeArg] = process.argv.slice(2);
const size = Number(sizeArg ?? 512);
const document = await new NodeIO().read(input);
document.getRoot().listNodes().filter((node) => node.getMesh()).forEach((node) => clearNodeTransform(node));
const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
const position = primitive.getAttribute('POSITION').getArray();
const color = primitive.getAttribute('COLOR_0')?.getArray();
const indices = primitive.getIndices()?.getArray();
const vertexCount = position.length / 3;
const order = indices ?? Uint32Array.from({ length: vertexCount }, (_v, i) => i);

// Project: screen x/y and depth per view (camera looks at the model's front from +Z for "front").
const project = (i) => {
  const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
  if (view === 'side') return [z, y, x];
  if (view === 'back') return [-x, y, -z];
  return [x, y, z];
};
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let i = 0; i < vertexCount; i += 1) {
  const [sx, sy] = project(i);
  minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
}
const span = Math.max(maxX - minX, maxY - minY) * 1.05;
const toPixel = ([sx, sy, depth]) => [((sx - (minX + maxX) / 2) / span + 0.5) * size, (0.5 - (sy - (minY + maxY) / 2) / span) * size, depth];

const pixels = new Uint8Array(size * size * 3).fill(205);
const zbuffer = new Float32Array(size * size).fill(-Infinity);
const light = [0.4, 0.6, 0.7];
const len = Math.hypot(...light); light.forEach((v, k) => { light[k] = v / len; });
for (let t = 0; t < order.length; t += 3) {
  const ids = [order[t], order[t + 1], order[t + 2]];
  const [a, b, c] = ids.map((i) => toPixel(project(i)));
  // Flat shading from the face normal (world space) so shapes read.
  const p = ids.map((i) => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]]);
  const u = [0, 1, 2].map((k) => p[1][k] - p[0][k]), v = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const nl = Math.hypot(...n) || 1;
  const shade = 0.55 + 0.45 * Math.abs((n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / nl);
  const rgb = color ? [0, 1, 2].map((k) => Math.min(255, Math.round(Math.pow(color[ids[0] * 4 + k], 1 / 2.2) * 255 * shade))) : [Math.round(200 * shade), Math.round(200 * shade), Math.round(200 * shade)];
  const minPx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxPx = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minPy = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxPy = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) continue;
  for (let py = minPy; py <= maxPy; py += 1) {
    for (let px = minPx; px <= maxPx; px += 1) {
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const depth = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const index = py * size + px;
      if (depth <= zbuffer[index]) continue;
      zbuffer[index] = depth;
      pixels.set(rgb, index * 3);
    }
  }
}
writeFileSync(output, Buffer.concat([Buffer.from(`P6 ${size} ${size} 255\n`), Buffer.from(pixels)]));
console.log('preview', view, 'bounds x', minX.toFixed(3), maxX.toFixed(3), 'y', minY.toFixed(3), maxY.toFixed(3));
