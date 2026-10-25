// Turns a raw image-to-3D export (millions of triangles, PBR textures) into a game-ready low-poly character:
//   1. bake the FBX node transform into the vertices (Z-up / cm exports)
//   2. optionally isolate one figure (image-to-3D tools fed a whole turnaround sheet build every view side by side)
//   3. simplify on POSITION only (UV seams would otherwise lock the simplifier far above the target)
//   4. give each low-poly triangle the texture colour of the nearest original triangle (one colour per face: the
//      faceted look of the rest of the game, no textures at runtime)
//   5. normalise: height in meters, feet on y = 0, centred on x/z (optionally turned 180 deg to face +Z)
// Prints diagnostics (triangles, bounds, width-by-height profile) for placing the rig joints.
//
// Usage: node process-character.mjs <in.glb> <out.glb> <targetTriangles> <heightMeters> [--figure N] [--flip-facing]
import { NodeIO } from '@gltf-transform/core';
import { clearNodeTransform, prune, simplify, unweld, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import jpeg from 'jpeg-js';

const [input, output, targetArg, heightArg, ...flags] = process.argv.slice(2);
const target = Number(targetArg ?? 6000);
const heightMeters = Number(heightArg ?? 1.95);
const figureFlag = flags.indexOf('--figure');
const figureIndex = figureFlag >= 0 ? Number(flags[figureFlag + 1]) : null;
const io = new NodeIO();
const document = await io.read(input);
const root = document.getRoot();
root.listNodes().filter((node) => node.getMesh()).forEach((node) => clearNodeTransform(node));
const primitive = root.listMeshes()[0].listPrimitives()[0];

// ── Snapshot the high-res mesh (positions, uvs, triangles) and its base-colour texture ───────────────────────────
const sourcePositions = primitive.getAttribute('POSITION').getArray().slice();
const sourceUvs = primitive.getAttribute('TEXCOORD_0').getArray().slice();
const sourceIndices = primitive.getIndices().getArray().slice();
const texture = jpeg.decode(primitive.getMaterial().getBaseColorTexture().getImage(), { useTArray: true });
console.log('input triangles', sourceIndices.length / 3);

const sampleTexture = (u, v) => {
  const x = Math.min(texture.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * texture.width)));
  const y = Math.min(texture.height - 1, Math.max(0, Math.floor((v - Math.floor(v)) * texture.height)));
  const offset = (y * texture.width + x) * 4;
  return [texture.data[offset], texture.data[offset + 1], texture.data[offset + 2]];
};

// ── Optional figure isolation: split the mesh where the occupied X range has a gap ───────────────────────────────
let keepTriangle = () => true;
if (figureIndex !== null) {
  const bins = 400;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < sourcePositions.length; i += 3) { minX = Math.min(minX, sourcePositions[i]); maxX = Math.max(maxX, sourcePositions[i]); }
  const occupied = new Uint8Array(bins);
  for (let i = 0; i < sourcePositions.length; i += 3) occupied[Math.min(bins - 1, Math.floor(((sourcePositions[i] - minX) / (maxX - minX)) * bins))] = 1;
  const figures = [];
  let start = -1;
  for (let bin = 0; bin <= bins; bin += 1) {
    if (bin < bins && occupied[bin]) { if (start < 0) start = bin; }
    else if (start >= 0) { figures.push([start, bin]); start = -1; }
  }
  console.log('figures found along X', figures.length);
  const [from, to] = figures[figureIndex];
  const lo = minX + (from / bins) * (maxX - minX);
  const hi = minX + (to / bins) * (maxX - minX);
  keepTriangle = (t) => {
    const cx = (sourcePositions[sourceIndices[t] * 3] + sourcePositions[sourceIndices[t + 1] * 3] + sourcePositions[sourceIndices[t + 2] * 3]) / 3;
    return cx >= lo && cx <= hi;
  };
}
const kept = [];
for (let t = 0; t < sourceIndices.length; t += 3) if (keepTriangle(t)) kept.push(sourceIndices[t], sourceIndices[t + 1], sourceIndices[t + 2]);
const keptIndices = Uint32Array.from(kept);

// Spatial grid of original triangle centroids (+ their texture colour) for the colour transfer.
const centroidOf = (indices, positions, t) => [0, 1, 2].map((k) => (positions[indices[t] * 3 + k] + positions[indices[t + 1] * 3 + k] + positions[indices[t + 2] * 3 + k]) / 3);
const cell = 0.004;
const grid = new Map();
const keyOf = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
for (let t = 0; t < keptIndices.length; t += 3) {
  const c = centroidOf(keptIndices, sourcePositions, t);
  const uv = [0, 1].map((k) => (sourceUvs[keptIndices[t] * 2 + k] + sourceUvs[keptIndices[t + 1] * 2 + k] + sourceUvs[keptIndices[t + 2] * 2 + k]) / 3);
  const key = keyOf(...c);
  const list = grid.get(key) ?? [];
  list.push([c[0], c[1], c[2], ...sampleTexture(uv[0], uv[1])]);
  grid.set(key, list);
}
const nearestColour = (p) => {
  let best = null, bestDistance = Infinity;
  for (let ring = 0; ring <= 3 && !best; ring += 1) {
    const [gx, gy, gz] = p.map((v) => Math.floor(v / cell));
    for (let dx = -ring; dx <= ring; dx += 1) for (let dy = -ring; dy <= ring; dy += 1) for (let dz = -ring; dz <= ring; dz += 1) {
      for (const entry of grid.get(`${gx + dx},${gy + dy},${gz + dz}`) ?? []) {
        const d = (entry[0] - p[0]) ** 2 + (entry[1] - p[1]) ** 2 + (entry[2] - p[2]) ** 2;
        if (d < bestDistance) { bestDistance = d; best = entry; }
      }
    }
  }
  return best ? [best[3], best[4], best[5]] : [128, 128, 128];
};

// ── Simplify on position only ───────────────────────────────────────────────────────────────────────────────────
primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(keptIndices).setBuffer(primitive.getAttribute('POSITION').getBuffer()));
primitive.setAttribute('TEXCOORD_0', null);
primitive.setAttribute('NORMAL', null);
primitive.setMaterial(null);
await MeshoptSimplifier.ready;
await document.transform(prune(), weld());
const triangles = () => (primitive.getIndices() ? primitive.getIndices().getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
console.log('kept triangles', triangles());
await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / triangles()), error: 1 }));
console.log('after simplify', triangles());

// ── One colour per low-poly face, transferred from the nearest original triangle ────────────────────────────────
await document.transform(unweld());
const position = primitive.getAttribute('POSITION');
const points = position.getArray();
const count = position.getCount();
const colours = new Float32Array(count * 4);
const srgbToLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
for (let t = 0; t < count; t += 3) {
  const centroid = [0, 1, 2].map((k) => (points[t * 3 + k] + points[(t + 1) * 3 + k] + points[(t + 2) * 3 + k]) / 3);
  const rgb = nearestColour(centroid).map(srgbToLinear);
  for (let corner = 0; corner < 3; corner += 1) colours.set([...rgb, 1], (t + corner) * 4);
}
primitive.setAttribute('COLOR_0', document.createAccessor().setType('VEC4').setArray(colours).setBuffer(position.getBuffer()));

// ── Normalise ────────────────────────────────────────────────────────────────────────────────────────────────────
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < points.length; i += 3) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], points[i + k]); max[k] = Math.max(max[k], points[i + k]); }
const scale = heightMeters / (max[1] - min[1]);
const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
const flip = flags.includes('--flip-facing') ? -1 : 1;
for (let i = 0; i < points.length; i += 3) {
  points[i] = (points[i] - cx) * scale * flip;
  points[i + 1] = (points[i + 1] - min[1]) * scale;
  points[i + 2] = (points[i + 2] - cz) * scale * flip;
}
position.setArray(points);

// Width profile: x extent per 5% height band (A-pose arms show up as the wide bands).
const bands = 20;
const extent = Array.from({ length: bands }, () => [Infinity, -Infinity]);
for (let i = 0; i < points.length; i += 3) {
  const band = Math.min(bands - 1, Math.floor((points[i + 1] / heightMeters) * bands));
  extent[band][0] = Math.min(extent[band][0], points[i]);
  extent[band][1] = Math.max(extent[band][1], points[i]);
}
console.log('width profile (height m: minX..maxX)');
extent.forEach(([lo, hi], band) => console.log(`  ${((band + 0.5) / bands * heightMeters).toFixed(2)}: ${lo.toFixed(2)} .. ${hi.toFixed(2)}`));

primitive.setMaterial(document.createMaterial('character').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0));
await document.transform(prune());
await io.write(output, document);
console.log('wrote', output, 'triangles', triangles(), 'size m', ((max[0] - min[0]) * scale).toFixed(2), 'x', heightMeters, 'x', ((max[2] - min[2]) * scale).toFixed(2));
