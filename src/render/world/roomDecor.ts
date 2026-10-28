import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MERCHANT_ROOM, roomLayout } from '../../core/systems/MerchantSystem';
import { toonMaterial } from '../materials';
import { ball, cone, cylinder, mergeParts, part } from '../models/parts';
import { WORLD_SCALE } from '../space';
import { buildIglooKitchen } from './iglooKitchen';
import { roomMaterial } from './roomMaterials';

/** Original palettes retained for missing-texture fallback. */
const TAVERN_LOOK = { floor: 0x766d5c, seam: 0x4a3220, rug: [0x754e30, 0xc6ad7d], wall: 0x6f6458, counter: 0x7a4a28, counterTop: 0x4a2c18, shelf: 0x5a3a22, barrel: 0x8a5a32, hoop: 0x4a4a52, table: 0x8a5a32, tableLeg: 0x5a3a22, hearth: 0x5a524a, lantern: 0xffc27a, brass: 0xba8c43, iron: 0x342e29, antler: 0xb3a084, wax: 0xf0e6c8, flame: 0xffd894, cork: 0xb58b59, herb: 0x6c7142, cloth: [0x345641, 0x873f37, 0x4e5971] };
const IGLOO_LOOK = { floor: 0xdfe9f2, seam: 0xb9cfe0, rug: [0x8a6a4a, 0xeee2c8], wall: 0xcfe4f4, counter: 0xa9d4ee, counterTop: 0xe8f4fc, shelf: 0x8fbfdc, barrel: 0xbfe0f2, hoop: 0x8fbfdc, table: 0xbfe0f2, tableLeg: 0x8fbfdc, hearth: 0x6a6460, lantern: 0xffb46a };


/** Static room art uses local meters; interaction anchors stay in MERCHANT_ROOM and the room's layout. */
export function buildRoomDecor(room: THREE.Group, igloo: boolean) {
    const look = igloo ? IGLOO_LOOK : TAVERN_LOOK;
    const layout = roomLayout(igloo);
    const flames: THREE.Mesh[] = [];
    const fireLight = new THREE.PointLight(0xff8a3a, 20, 9, 2);
    const at = (x: number, y: number, height = 0) => new THREE.Vector3(x * WORLD_SCALE, height, y * WORLD_SCALE);
    // Colored props are batched into lit/glowing meshes; textured surfaces are batched per material.
    const lit: THREE.BufferGeometry[] = [];
    const unlit: THREE.BufferGeometry[] = [];
    const solid = (geometry: THREE.BufferGeometry, color: number, position: THREE.Vector3) => {
      lit.push(part(geometry, color, [position.x, position.y, position.z]));
    };
    const glow = (geometry: THREE.BufferGeometry, color: number, position: THREE.Vector3) => {
      unlit.push(part(geometry, color, [position.x, position.y, position.z]));
    };
    const surfaces = new Map<string, { color: number; geometries: THREE.BufferGeometry[] }>();
    const surface = (geometry: THREE.BufferGeometry, name: string, color: number, position: THREE.Vector3, repeatX = 1, repeatY = 1) => {
      geometry.translate(position.x, position.y, position.z);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
      const batch = surfaces.get(name) ?? { color, geometries: [] };
      batch.geometries.push(geometry);
      surfaces.set(name, batch);
    };
    const size = MERCHANT_ROOM.size * WORLD_SCALE;
    const half = size / 2;

    // Authored pixel albedo surfaces, repeated in meters with UVs retained.
    surface(new THREE.BoxGeometry(size, 0.2, size), igloo ? 'igloo_snow' : 'tavern_flagstone', look.floor, new THREE.Vector3(0, -0.1, 0), 5, 5);
    if (igloo) {
      // Overlapping hides give a soft irregular edge without covering interaction anchors.
      surface(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2).scale(2.6, 1, 1.7), 'igloo_fur', look.rug[1], at(10, 20, 0.025), 2, 2);
      for (const [x, z] of [[-2, -0.8], [2, -0.8], [-1.9, 0.9], [1.9, 0.9]]) {
        surface(new THREE.CircleGeometry(0.55, 8).rotateX(-Math.PI / 2), 'igloo_fur', look.rug[1], at(10 + x / WORLD_SCALE, 20 + z / WORLD_SCALE, 0.024));
      }
    } else {
      for (const table of layout.tables) {
        surface(new THREE.BoxGeometry(3.2, 0.018, 3.2), 'tavern_planks', look.table, at(table.x, table.y, 0.009), 1.5, 1.5);
        surface(new THREE.CircleGeometry(1.35, 18).rotateX(-Math.PI / 2), 'tavern_fur', look.rug[1], at(table.x, table.y, 0.022));
      }
      surface(new THREE.CircleGeometry(1.45, 18).rotateX(-Math.PI / 2), 'tavern_fur', look.rug[1], at(layout.fireplace.x, layout.fireplace.y - 65, 0.025));
    }

    // The freestanding portal sits inside the room, in front of a continuous north wall.
    const thick = 0.5;
    // Full-height walls on the far sides; cutaway foreground keeps the hero and tables readable.
    const backWallHeight = 5.2;
    const frontWallHeight = 2.2;
    const wall = (width: number, depth: number, x: number, z: number) => {
      const height = x === -half || z === -half ? backWallHeight : frontWallHeight;
      if (!igloo) surface(new THREE.BoxGeometry(width, height, depth), 'tavern_wall', look.wall, new THREE.Vector3(x, height / 2, z), Math.max(width, depth) / 3, height / 1.6);
    };
    wall(thick, size + thick, -half, 0);
    wall(thick, size + thick, half, 0);
    wall(size + thick, thick, 0, half);
    wall(size + thick, thick, 0, -half);

    // The bar: the igloo's straight counter with the shelf behind it, or the tavern's round island (a ring of
    // counter segments with a darker overhanging top) around the bottle tower. A stack of barrels in the corner.
    const bottleColors = [0x3a8a4a, 0x8a2a3a, 0x2a5a9a, 0xc9963f, 0x6a3a8a];
    const { counter, island, bottleTower } = layout;
    if (counter) {
      const counterSize = new THREE.Vector3(counter.halfWidth * 2 * WORLD_SCALE, 1.1, counter.halfHeight * 2 * WORLD_SCALE);
      surface(new THREE.BoxGeometry(counterSize.x, counterSize.y, counterSize.z), 'igloo_ice', look.counter, at(counter.x, counter.y, 0.55), 1, 4);
      surface(new THREE.BoxGeometry(counterSize.x + 0.2, 0.1, counterSize.z + 0.2), 'igloo_ice', look.counterTop, at(counter.x, counter.y, 1.12), 1, 4);
      for (let level = 0; level < 3; level += 1) solid(new THREE.BoxGeometry(0.45, 0.06, 9), look.shelf, at(-305, 0, 0.7 + level * 0.6));
    }
    if (island) {
      const segments = 18;
      const outer = island.outer * WORLD_SCALE;
      const inner = island.inner * WORLD_SCALE;
      // Closed annular profiles: continuous ring, exact outer radius at each vertex, no overlapping box corners.
      const ring = (inside: number, outside: number, bottom: number, top: number) => new THREE.LatheGeometry([
        new THREE.Vector2(inside, bottom), new THREE.Vector2(outside, bottom),
        new THREE.Vector2(outside, top), new THREE.Vector2(inside, top), new THREE.Vector2(inside, bottom)
      ], segments);
      surface(ring(inner, outer, 0, 1.0), 'tavern_island', look.counter, at(island.x, island.y), 6, 1);
      solid(ring(inner - 0.04, outer + 0.04, 1.0, 1.1), look.counterTop, at(island.x, island.y));
      solid(ring(outer + 0.005, outer + 0.045, 0.92, 0.97), TAVERN_LOOK.brass, at(island.x, island.y));
      const rail = new THREE.TorusGeometry(outer + 0.12, 0.035, 5, segments).rotateX(Math.PI / 2);
      solid(rail, TAVERN_LOOK.brass, at(island.x, island.y, 0.22));
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const p = at(island.x, island.y).add(new THREE.Vector3(Math.sin(angle) * (outer + 0.08), 0.12, Math.cos(angle) * (outer + 0.08)));
        solid(cylinder(0.035, 0.035, 0.23, 5), TAVERN_LOOK.brass, p);
      }
      for (const angle of [-0.3, 0, 0.3]) {
        const tap = at(island.x, island.y).add(new THREE.Vector3(Math.sin(angle) * (outer - 0.28), 0, -Math.cos(angle) * (outer - 0.28)));
        solid(cylinder(0.065, 0.09, 0.4, 6), TAVERN_LOOK.brass, tap.clone().setY(1.3));
        solid(cylinder(0.045, 0.045, 0.23, 6).rotateX(Math.PI / 2), TAVERN_LOOK.brass, tap.clone().add(new THREE.Vector3(0, 1.43, -0.08)));
        solid(cylinder(0.035, 0.035, 0.17, 6), look.counterTop, tap.clone().setY(1.58));
      }
      for (const angle of [0.8, 1.7, 3.9, 4.8]) {
        const mug = at(island.x, island.y).add(new THREE.Vector3(Math.sin(angle) * (outer - 0.3), 1.22, Math.cos(angle) * (outer - 0.3)));
        solid(cylinder(0.09, 0.08, 0.24, 8), look.barrel, mug);
        solid(cylinder(0.095, 0.095, 0.03, 8), TAVERN_LOOK.brass, mug.clone().add(new THREE.Vector3(0, 0.12, 0)));
        solid(new THREE.TorusGeometry(0.07, 0.02, 4, 8), TAVERN_LOOK.brass, mug.clone().add(new THREE.Vector3(0.11, 0, 0)));
      }
    }
    if (bottleTower) {
      // A round column with three shelf tiers of bottles.
      solid(cylinder(0.3, 0.35, 2.6, 10), look.shelf, at(bottleTower.x, bottleTower.y, 1.3));
      for (let level = 0; level < 3; level += 1) {
        const y = 0.75 + level * 0.65;
        solid(cylinder(0.72, 0.72, 0.06, 12), look.counterTop, at(bottleTower.x, bottleTower.y, y));
        for (let index = 0; index < 12; index += 1) {
          const angle = (index / 12) * Math.PI * 2 + level * 0.3;
          const height = 0.3 + ((index * 7 + level * 3) % 4) * 0.06;
          const spot = at(bottleTower.x, bottleTower.y).add(new THREE.Vector3(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55));
          const color = bottleColors[(index + level * 2) % bottleColors.length];
          solid(cylinder(0.07, 0.09, height, 6), color, spot.clone().setY(y + 0.03 + height / 2));
          solid(cylinder(0.035, 0.035, 0.12, 6), color, spot.clone().setY(y + 0.03 + height + 0.06));
          solid(cylinder(0.036, 0.036, 0.045, 6), TAVERN_LOOK.cork, spot.clone().setY(y + 0.03 + height + 0.14));
          glow(new THREE.BoxGeometry(0.025, height * 0.55, 0.012), color, spot.clone().add(new THREE.Vector3(0, y + 0.04 + height / 2, -0.085)));
        }
      }
      // Kegs sit on the far side of the tower, leaving the merchant's position clear.
      for (const angle of [-0.9, 0, 0.9]) {
        const keg = at(bottleTower.x, bottleTower.y).add(new THREE.Vector3(Math.sin(angle) * 0.85, 0, Math.cos(angle) * 0.85));
        solid(cylinder(0.25, 0.27, 0.56, 8), look.barrel, keg.clone().setY(0.28));
        for (const height of [0.1, 0.46]) solid(cylinder(0.28, 0.28, 0.04, 8), TAVERN_LOOK.brass, keg.clone().setY(height));
      }
    }
    [[-280, 280], [-250, 285], [-282, 250]].forEach(([x, y]) => {
      solid(cylinder(0.42, 0.42, 0.95, 10), look.barrel, at(x, y, 0.48));
      solid(cylinder(0.44, 0.44, 0.06, 10), look.hoop, at(x, y, 0.2));
      solid(cylinder(0.44, 0.44, 0.06, 10), look.hoop, at(x, y, 0.76));
    });

    // The fireplace in the south wall.
    const hearth = at(layout.fireplace.x, layout.fireplace.y);
    if (igloo) {
      solid(cylinder(0.85, 0.55, 0.4, 10), look.hearth, hearth.clone().setY(0.25));
      solid(cylinder(0.88, 0.88, 0.09, 10), 0x333943, hearth.clone().setY(0.48));
      for (const x of [-0.5, 0.5]) solid(new THREE.BoxGeometry(0.14, 0.35, 0.14), 0x454b54, hearth.clone().add(new THREE.Vector3(x, 0.16, 0)));
    } else {
      // Open stone surround: the recess and animated flames remain visible.
      for (const x of [-1.05, 1.05]) solid(new THREE.BoxGeometry(0.5, 1.9, 1.1), look.hearth, hearth.clone().add(new THREE.Vector3(x, 0.95, 0)));
      solid(new THREE.BoxGeometry(2.85, 0.35, 1.2), 0x837467, hearth.clone().setY(2.05));
      solid(new THREE.BoxGeometry(1.65, 0.8, 0.7), look.hearth, hearth.clone().setY(2.6));
      solid(new THREE.BoxGeometry(3.1, 0.15, 1.65), 0x827568, hearth.clone().setY(0.075));
      for (let row = 0; row < 4; row++) for (const x of [-1.05, 1.05]) glow(new THREE.BoxGeometry(0.48, 0.035, 0.025), 0x403c39, hearth.clone().add(new THREE.Vector3(x, 0.3 + row * 0.43, -0.56)));
    }
    if (!igloo) glow(new THREE.BoxGeometry(1.5, 1.0, 0.2), 0x1a0e08, hearth.clone().add(new THREE.Vector3(0, 0.55, -0.4)));
    ([[-0.3, 0xff7a2a], [0.05, 0xffb04a], [0.32, 0xff7a2a]] as const).forEach(([offset, color]) => {
      const flame = new THREE.Mesh(cone(0.22, 0.6, 5).translate(0, 0.3, 0), new THREE.MeshBasicMaterial({ color }));
      flame.position.copy(hearth).add(new THREE.Vector3(offset, igloo ? 0.46 : 0.05, igloo ? 0 : -0.45));
      room.add(flame);
      flames.push(flame);
    });
    fireLight.position.copy(hearth).add(new THREE.Vector3(0, 1, -1.2));
    room.add(fireLight);

    // The record book on its lectern, by the fireplace.
    const lectern = layout.records;
    solid(cylinder(0.08, 0.12, 1.0, 6), 0x5a3a22, at(lectern.x, lectern.y, 0.5));
    solid(new THREE.BoxGeometry(0.62, 0.06, 0.46), 0x6b4a2e, at(lectern.x, lectern.y, 1.02));
    solid(new THREE.BoxGeometry(0.56, 0.07, 0.4), 0x5a1f22, at(lectern.x, lectern.y, 1.08));
    glow(new THREE.BoxGeometry(0.5, 0.02, 0.34), 0xf3e6c4, at(lectern.x, lectern.y, 1.12));

    // Lanterns: over the igloo's counter and two of its tables, or over every tavern table plus a stronger light
    // hanging over the island (the chandelier's).
    const lantern = (x: number, y: number, height = 3, intensity = 14, distance = 9) => {
      const light = new THREE.PointLight(look.lantern, intensity, distance, 2);
      light.position.copy(at(x, y, height));
      room.add(light);
      glow(new THREE.BoxGeometry(0.3, 0.4, 0.3), 0xffd894, light.position);
    };
    if (counter) [[counter.x, -100], [counter.x, 120], [130, -90], [130, 190]].forEach(([x, y]) => lantern(x, y));
    else layout.tables.forEach((table) => lantern(table.x, table.y));
    if (island) {
      const center = at(island.x, island.y, 3.2);
      const light = new THREE.PointLight(look.lantern, 20, 12, 2);
      light.position.copy(center); room.add(light);
      solid(new THREE.TorusGeometry(1.32, 0.065, 6, 18).rotateX(Math.PI / 2), TAVERN_LOOK.iron, center);
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const radial = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        const candle = center.clone().addScaledVector(radial, 1.32);
        solid(cylinder(0.12, 0.12, 0.045, 8), TAVERN_LOOK.brass, candle.clone().add(new THREE.Vector3(0, 0.06, 0)));
        solid(cylinder(0.065, 0.07, 0.25, 6), TAVERN_LOOK.wax, candle.clone().add(new THREE.Vector3(0, 0.2, 0)));
        glow(cone(0.055, 0.14, 5), TAVERN_LOOK.flame, candle.clone().add(new THREE.Vector3(0, 0.4, 0)));
        solid(cone(0.065, 0.65, 5).rotateZ(-0.75).rotateY(-angle), TAVERN_LOOK.antler, candle.clone().addScaledVector(radial, 0.22).add(new THREE.Vector3(0, 0.18, 0)));
        solid(cone(0.045, 0.35, 5), TAVERN_LOOK.antler, candle.clone().addScaledVector(radial, 0.35).add(new THREE.Vector3(0, 0.38, 0)));
        if (i % 2 === 0) solid(cylinder(0.018, 0.018, 1.25, 4).rotateZ(-0.7).rotateY(-angle), TAVERN_LOOK.iron, center.clone().addScaledVector(radial, 0.8).add(new THREE.Vector3(0, 0.5, 0)));
      }
    }

    // The regulars' tables: a round top on one leg, mugs and a candle (a crystal ball on Zora's).
    layout.tables.forEach((table, index) => {
      const radius = MERCHANT_ROOM.tableRadius * WORLD_SCALE;
      solid(cylinder(radius, radius, 0.08, 10), look.table, at(table.x, table.y, 0.85));
      solid(cylinder(0.1, 0.12, 0.85, 6), look.tableLeg, at(table.x, table.y, 0.42));
      solid(cylinder(0.45, 0.5, 0.06, 8), look.tableLeg, at(table.x, table.y, 0.03));
      solid(cylinder(0.1, 0.1, 0.2, 8), 0x9a6a3a, at(table.x - 10, table.y - 10, 0.99));
      solid(cylinder(0.1, 0.1, 0.2, 8), 0x9a6a3a, at(table.x + 12, table.y + 8, 0.99));
      if (igloo) {
        const plate = at(table.x + 14, table.y, 0.93);
        solid(cylinder(0.33, 0.3, 0.055, 16), 0xffefd1, plate);
        solid(cylinder(0.24, 0.24, 0.035, 12), 0xb56434, plate.clone().setY(0.97));
        solid(ball(0.14, 1).scale(1, 0.5, 0.65), 0x71412d, plate.clone().add(new THREE.Vector3(0, 0.09, 0)));
        for (const dz of [-0.12, 0.08, 0.18]) solid(ball(0.07, 0), dz < 0 ? 0xf4a23b : 0x73a04b, plate.clone().add(new THREE.Vector3(-0.12, 0.06, dz)));
        for (const side of [-1, 1]) {
          const utensil = plate.clone().add(new THREE.Vector3(0, 0, side * 0.43));
          solid(new THREE.BoxGeometry(0.28, 0.025, 0.035), 0xc8dce5, utensil);
          for (let t = 0; t < 3; t++) solid(new THREE.BoxGeometry(0.12, 0.025, 0.015), 0xc8dce5, utensil.clone().add(new THREE.Vector3(-0.16, 0, (t - 1) * 0.035)));
        }
        const chair = at(layout.npcs[index].x, layout.npcs[index].y);
        solid(new THREE.BoxGeometry(0.75, 0.15, 0.8), 0x795036, chair.clone().setY(0.55));
        solid(new THREE.BoxGeometry(0.14, 1.1, 0.8), 0x795036, chair.clone().add(new THREE.Vector3(0.35, 0.7, 0)));
        for (const dx of [-0.25, 0.25]) for (const dz of [-0.27, 0.27]) solid(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0x513625, chair.clone().add(new THREE.Vector3(dx, 0.25, dz)));
      }
      if (index === 3 && !igloo) {
        glow(ball(0.24, 1), 0x9fe8ff, at(table.x, table.y, 1.14));
        solid(cylinder(0.15, 0.2, 0.08, 8), 0xc9963f, at(table.x, table.y, 0.93));
      } else {
        solid(cylinder(0.05, 0.05, 0.18, 6), 0xf0e6c8, at(table.x + 6, table.y - 14, 0.98));
        glow(cone(0.04, 0.09, 4), 0xffc65a, at(table.x + 6, table.y - 14, 1.12));
      }
    });

    if (igloo) {
      // Open-roof cutaway: successive courses lean inward to suggest the snow dome.
      // The rounded-square perimeter preserves the original square room's playable anchors.
      for (let course = 0; course < 8; course++) {
        const count = 48;
        for (let i = 0; i < count; i++) {
          const angle = (i + (course % 2) * 0.5) / count * Math.PI * 2;
          const c = Math.cos(angle), z = Math.sin(angle);
          const radius = (half + 0.1 - course * 0.065) / Math.pow(Math.pow(Math.abs(c), 8) + Math.pow(Math.abs(z), 8), 1 / 8);
          const x = c * radius, depth = z * radius;
          // Continuous rear wall behind the entrance tunnel.
          if ((depth > half - 0.8 || x > half - 0.8) && course > 2) continue; // Camera-facing cutaway.
          const nextAngle = angle + 0.002;
          const nextR = (half + 0.1 - course * 0.065) / Math.pow(Math.pow(Math.abs(Math.cos(nextAngle)), 8) + Math.pow(Math.abs(Math.sin(nextAngle)), 8), 1 / 8);
          const tangent = Math.atan2(Math.sin(nextAngle) * nextR - depth, Math.cos(nextAngle) * nextR - x);
          const geometry = new THREE.BoxGeometry(1.65, 0.56, 0.62).rotateY(-tangent);
          // Sample one snow face inside the wall texture rather than shrinking many brick rows onto each block.
          const uv = geometry.getAttribute('uv');
          for (let j = 0; j < uv.count; j++) uv.setXY(j, 0.08 + uv.getX(j) * 0.22, 0.36 + uv.getY(j) * 0.1);
          surface(geometry, 'igloo_ice', look.wall, new THREE.Vector3(x, 0.29 + course * 0.6, depth));
        }
      }
      buildIglooKitchen(solid, glow);
      // Dry fish suspended above the rear shelf.
      for (let i = 0; i < 9; i++) {
        const z = -3.6 + i * 0.86;
        solid(cylinder(0.014, 0.014, 0.5, 4), 0xb7a180, new THREE.Vector3(-9.3, 2.2, z));
        solid(ball(0.17, 0).scale(0.7, 2, 0.75), i % 2 ? 0xa38a69 : 0x748b90, new THREE.Vector3(-9.3, 1.8, z));
        solid(cone(0.12, 0.2, 4), 0x8a7155, new THREE.Vector3(-9.3, 1.45, z));
      }
    } else {
      // Half timber framing along the perimeter, with short roof brackets.
      for (const x of [-half + 0.15, half - 0.15]) for (const z of [-8, -4, 0, 4, 8]) {
        const height = x < 0 ? backWallHeight : frontWallHeight;
        solid(new THREE.BoxGeometry(0.25, height, 0.3), look.shelf, new THREE.Vector3(x, height / 2, z));
        solid(new THREE.BoxGeometry(0.8, 0.18, 0.25).rotateZ(x < 0 ? 0.6 : -0.6), look.counterTop, new THREE.Vector3(x + (x < 0 ? 0.3 : -0.3), height - 0.4, z));
      }
      for (const x of [-half, half]) solid(new THREE.BoxGeometry(0.32, 0.25, size), look.counterTop, new THREE.Vector3(x, x < 0 ? backWallHeight : frontWallHeight, 0));
      solid(new THREE.BoxGeometry(size, 0.25, 0.32), look.counterTop, new THREE.Vector3(0, backWallHeight, -half));
      // Wall ornaments stay at the perimeter, clear of paths and the regulars' overhead markers.
      const ornament = (x: number, z: number, yaw: number, index: number) => {
        const anchor = new THREE.Vector3(x, 0, z);
        const local = (geometry: THREE.BufferGeometry, color: number, dx: number, height: number, depth = 0) => {
          solid(geometry.rotateY(yaw), color, new THREE.Vector3(dx, height, depth).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(anchor));
        };
        local(new THREE.BoxGeometry(0.9, 1.25, 0.045), TAVERN_LOOK.cloth[index % TAVERN_LOOK.cloth.length], 0, 1.45);
        local(new THREE.BoxGeometry(0.07, 1.23, 0.02), TAVERN_LOOK.brass, -0.36, 1.45, 0.035);
        local(new THREE.BoxGeometry(0.07, 1.23, 0.02), TAVERN_LOOK.brass, 0.36, 1.45, 0.035);
        local(cylinder(0.035, 0.035, 1.12, 6).rotateZ(Math.PI / 2), TAVERN_LOOK.brass, 0, 2.11);
        local(cylinder(0.43, 0.43, 0.1, 12).rotateX(Math.PI / 2), look.counterTop, 1.15, 1.45, 0.02);
        local(new THREE.TorusGeometry(0.4, 0.035, 4, 12), TAVERN_LOOK.brass, 1.15, 1.45, 0.09);
        local(ball(0.12, 1).scale(1, 1, 0.4), TAVERN_LOOK.brass, 1.15, 1.45, 0.11);
        for (const side of [-1, 1]) {
          local(new THREE.BoxGeometry(0.065, 1.0, 0.035).rotateZ(side * 0.65), TAVERN_LOOK.antler, -1.15, 1.65, 0.07);
          local(new THREE.BoxGeometry(0.31, 0.045, 0.06).rotateZ(side * 0.65), TAVERN_LOOK.brass, -1.15 + side * 0.26, 1.3, 0.08);
        }
        for (let i = 0; i < 4; i++) {
          local(cylinder(0.012, 0.012, 0.42, 4), look.shelf, 2.05 + i * 0.09, 2.25);
          local(cone(0.13, 0.4, 5).rotateZ(Math.PI), TAVERN_LOOK.herb, 2.05 + i * 0.09, 1.96, 0.03);
        }
      };
      ornament(-half + 0.3, 0, Math.PI / 2, 0);
      ornament(half - 0.3, 0, -Math.PI / 2, 1);
      ornament(-5.7, -half + 0.3, 0, 1);
      ornament(5.7, -half + 0.3, 0, 0);
      // Benches on the two tangential sides of each table: never between the regular and the island, never on the
      // walkway.
      for (const table of layout.tables) {
        const toIsland = Math.atan2((island?.x ?? 0) - table.x, (island?.y ?? 0) - table.y);
        for (const side of [-1, 1]) {
          const offset = new THREE.Vector3(Math.cos(toIsland) * side * 1.55, 0, -Math.sin(toIsland) * side * 1.55);
          const bench = at(table.x, table.y).add(offset);
          solid(new THREE.BoxGeometry(0.45, 0.14, 1.5).rotateY(toIsland), look.table, bench.clone().setY(0.5));
          for (const along of [-0.55, 0.55]) {
            const leg = bench.clone().add(new THREE.Vector3(Math.sin(toIsland) * along, 0.23, Math.cos(toIsland) * along));
            solid(new THREE.BoxGeometry(0.33, 0.45, 0.13).rotateY(toIsland), look.tableLeg, leg);
          }
        }
      }
    }
    // Each texture is one draw call even when used by many separate ice blocks.
    for (const [name, batch] of surfaces) {
      const geometry = mergeGeometries(batch.geometries);
      batch.geometries.forEach(part => part.dispose());
      if (!geometry) throw new Error('Room surface attributes must match');
      const mesh = new THREE.Mesh(geometry, roomMaterial(name, batch.color));
      mesh.castShadow = mesh.receiveShadow = true;
      room.add(mesh);
    }

    const props = new THREE.Mesh(mergeParts(lit), toonMaterial({ vertexColors: true, flatShading: true }));
    props.castShadow = true;
    props.receiveShadow = true;
    room.add(props, new THREE.Mesh(mergeParts(unlit), new THREE.MeshBasicMaterial({ vertexColors: true })));

    return { flames, fireLight };
}
