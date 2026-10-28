import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../materials';

/** A stone doorway, with living vines and an amber passage. Geometry is batched by material. */
export class MerchantPortal extends THREE.Group {
  private readonly energy: THREE.ShaderMaterial;

  constructor() {
    super();
    this.name = 'merchant-portal';
    // Keep the doorway open toward the fixed isometric camera, including when its energy animates.
    this.rotation.y = Math.PI / 4;
    const stone: THREE.BufferGeometry[] = [], plants: THREE.BufferGeometry[] = [], runes: THREE.BufferGeometry[] = [];
    const colored = (list: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, color: number) => {
      if (geometry.index) {
        const original = geometry;
        geometry = geometry.toNonIndexed();
        original.dispose();
      }
      const rgb = new THREE.Color(color), count = geometry.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) rgb.toArray(colors, i * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      list.push(geometry);
    };
    const block = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) =>
      colored(stone, new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
    for (let i = 0; i < 5; i++) block(0.66, 0.2, 1.05, (i - 2) * 0.65, 0.1, 0.06, i % 2 ? 0x8c866d : 0xa39a7b);
    for (const side of [-1, 1]) {
      block(0.66, 0.35, 0.78, side * 1.25, 0.37, 0, 0x8f896f);
      for (let level = 0; level < 4; level++)
        block(0.46, 0.365, 0.55, side * 1.25, 0.73 + level * 0.37, 0, level % 2 ? 0x99957d : 0xaca389);
      block(0.64, 0.16, 0.72, side * 1.25, 2.08, 0, 0xb6ac8c);
    }
    // Individual voussoirs with visible mortar gaps, following a tall pointed arch.
    const arch = (angle: number, radius: number, rise: number) => new THREE.Vector2(
      Math.cos(angle) * radius, 2.12 + Math.pow(Math.sin(angle), 0.82) * rise);
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * Math.PI + 0.012, b = (i + 1) / 11 * Math.PI - 0.012;
      const points = [arch(a, 1.49, 1.66), arch(b, 1.49, 1.66), arch(b, 1.01, 1.15), arch(a, 1.01, 1.15)];
      const shape = new THREE.Shape(points);
      const wedge = new THREE.ExtrudeGeometry(shape, { depth: 0.56, bevelEnabled: false, steps: 1, curveSegments: 1 }).translate(0, 0, -0.28);
      colored(stone, wedge, [0xa49c80, 0x8f8c76, 0xb5aa8c][i % 3]);
    }
    // Creepers travel up both pillars and curl over the arch. Low-poly leaves catch the room light.
    for (const side of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 18; i++) {
        const y = 0.25 + i * 0.185;
        const x = side * (y < 2.12 ? 1.3 + Math.sin(i * 0.7) * 0.17 : 1.32 * (1 - (y - 2.12) / 1.8));
        points.push(new THREE.Vector3(x, y, 0.35 + Math.cos(i * 0.8) * 0.06));
        if (i % 2 === 0) {
          const leaf = new THREE.SphereGeometry(1, 4, 2).scale(0.12, 0.23, 0.045).rotateZ(side * (i % 4 ? -0.8 : 0.8));
          leaf.translate(x + side * (i % 4 ? -0.12 : 0.12), y + 0.07, 0.4);
          colored(plants, leaf, i % 4 ? 0x667e32 : 0x829447);
        }
      }
      colored(plants, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, 0.037, 4, false), 0x485e29);
    }
    // Inlaid angular glyphs, rather than a floating ring around the frame.
    const stroke = (x: number, y: number, length: number, angle: number) =>
      colored(runes, new THREE.BoxGeometry(0.027, length, 0.014).rotateZ(angle).translate(x, y, 0.291), 0xeac679);
    for (const side of [-1, 1]) for (const y of [0.9, 1.48]) {
      stroke(side * 1.25, y, 0.22, 0);
      stroke(side * 1.25 + 0.045, y + 0.04, 0.13, -0.8);
      stroke(side * 1.25 - 0.035, y - 0.045, 0.11, -0.8);
    }
    stroke(0, 3.54, 0.21, 0); stroke(0.045, 3.58, 0.14, -0.8);
    const batch = (list: THREE.BufferGeometry[], material: THREE.Material, name: string) => {
      const geometry = mergeGeometries(list, false)!;
      list.forEach(part => part.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      this.add(mesh);
    };
    batch(stone, toonMaterial({ vertexColors: true }), 'stone-arch');
    batch(plants, toonMaterial({ vertexColors: true }), 'vines');
    batch(runes, new THREE.MeshBasicMaterial({ vertexColors: true }), 'inlaid-runes');

    // Opaque, unlit passage: the destination has depth and never reveals the wall/arena behind it.
    // A single procedural surface avoids texture downloads and animates only the magic, never the masonry.
    this.energy = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } }, side: THREE.DoubleSide,
      vertexShader: `varying vec2 portalPoint;
        void main(){ portalPoint=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 portalPoint; uniform float time;
        void main(){
          vec2 p=(portalPoint-vec2(0.0,1.72))/vec2(1.04,1.65);
          float r=length(p), a=atan(p.y,p.x);
          float spiral=sin(r*32.0-a*3.0-time*2.4+sin(a*4.0+r*9.0-time)*0.55);
          float filaments=pow(max(0.0,spiral),14.0);
          float haze=0.5+0.5*sin(a*5.0-r*14.0+time*1.1);
          float heart=exp(-r*r*9.0);
          float rim=pow(smoothstep(0.65,1.0,r),3.0);
          vec3 color=mix(vec3(0.18,0.065,0.018),vec3(0.66,0.29,0.025),(1.0-r)*0.55+haze*0.16);
          color+=vec3(0.85,0.43,0.065)*filaments*(0.25+0.65*r);
          color+=vec3(1.0,0.84,0.37)*heart*1.35+vec3(0.65,0.28,0.025)*rim;
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const opening = new THREE.Shape();
    opening.moveTo(-1.015, 0.21); opening.lineTo(1.015, 0.21); opening.lineTo(1.015, 2.12);
    for (let i = 0; i <= 24; i++) {
      const a = i / 24 * Math.PI;
      opening.lineTo(Math.cos(a) * 1.015, 2.12 + Math.pow(Math.sin(a), 0.82) * 1.16);
    }
    opening.closePath();
    const passage = new THREE.Mesh(new THREE.ShapeGeometry(opening), this.energy);
    passage.name = 'amber-passage'; passage.position.z = 0.05;
    this.add(passage);
  }

  animate(time: number): void { this.energy.uniforms.time.value = time; }
}
