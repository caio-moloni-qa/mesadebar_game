import * as THREE from 'three';

/** Low internal resolution (THREEJS_3D_MIGRATION_TEMP.md §3.1): the scene renders at most 640×360 and is scaled
 *  up by a whole number, so pixels stay crisp squares and fragment cost doesn't grow with the screen. A small
 *  border of extra texels lets the upscale pass shift the image by the camera's sub-texel offset. */
export const MAX_INTERNAL_WIDTH = 640;
export const MAX_INTERNAL_HEIGHT = 360;
export const INTERNAL_PADDING = 2;
/** 40 m across 640 px → 16 px per meter, fixed: the texel size never changes, only how many fit on screen. */
export const METERS_PER_TEXEL = 40 / MAX_INTERNAL_WIDTH;

export interface PipelineLayout {
  /** Whole-number device pixels per internal pixel. */
  pixelScale: number;
  internalWidth: number;
  internalHeight: number;
  /** Where internal pixel (0, 0) lands on the canvas — zero or slightly negative (the overhang is cropped). */
  originX: number;
  originY: number;
}

/** "Envelope" fit, like the Phaser build's Scale.ENVELOP: the smallest whole scale that covers the canvas, with the
 *  internal resolution shrunk to match. The image always fills the screen (no letterbox bars) and no aspect ratio
 *  ever sees more than the nominal 640×360 texels (40 × 22.5 m) — wide or tall screens crop instead. */
export function envelopeLayout(width: number, height: number): PipelineLayout {
  const pixelScale = Math.max(1, Math.ceil(Math.max(width / MAX_INTERNAL_WIDTH, height / MAX_INTERNAL_HEIGHT) - 1e-9));
  const internalWidth = Math.max(1, Math.ceil(width / pixelScale));
  const internalHeight = Math.max(1, Math.ceil(height / pixelScale));
  return {
    pixelScale,
    internalWidth,
    internalHeight,
    originX: Math.floor((width - internalWidth * pixelScale) / 2),
    originY: Math.floor((height - internalHeight * pixelScale) / 2)
  };
}

const compositeVertex = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Outline + highlight + ordered dither + nearest upscale, all from the low-res targets.
//  - Depth edges: a pixel noticeably CLOSER than a neighbour is an object's silhouette → darken it.
//  - Normal edges: where normals change and the neighbour isn't in front (a convex crease seen from outside),
//    lighten → the bright rim on wall tops / ribs in the style reference.
const compositeFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 targetSize;
  uniform vec2 viewportOrigin;
  uniform float pixelScale;
  uniform vec2 subTexelOffset;
  uniform float padding;
  uniform float depthRange;
  uniform float outlineDarken;
  uniform float highlightBoost;
  uniform float ditherLevels;

  float linearDepth(vec2 texel) {
    return texture2D(tDepth, (texel + 0.5) / targetSize).r * depthRange;
  }
  vec3 viewNormal(vec2 texel) {
    return texture2D(tNormal, (texel + 0.5) / targetSize).xyz * 2.0 - 1.0;
  }
  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int index = x + y * 4;
    float m[16];
    m[0] = 0.0;  m[1] = 8.0;  m[2] = 2.0;  m[3] = 10.0;
    m[4] = 12.0; m[5] = 4.0;  m[6] = 14.0; m[7] = 6.0;
    m[8] = 3.0;  m[9] = 11.0; m[10] = 1.0; m[11] = 9.0;
    m[12] = 15.0; m[13] = 7.0; m[14] = 13.0; m[15] = 5.0;
    for (int i = 0; i < 16; i++) { if (i == index) return m[i] / 16.0; }
    return 0.0;
  }

  void main() {
    vec2 internalPx = (gl_FragCoord.xy - viewportOrigin) / pixelScale;
    vec2 texel = floor(internalPx + subTexelOffset) + padding;
    vec3 color = texture2D(tColor, (texel + 0.5) / targetSize).rgb;

    float depth = linearDepth(texel);
    vec3 normal = viewNormal(texel);
    vec2 offsets[4];
    offsets[0] = vec2(1.0, 0.0); offsets[1] = vec2(-1.0, 0.0); offsets[2] = vec2(0.0, 1.0); offsets[3] = vec2(0.0, -1.0);

    float depthEdge = 0.0;
    float normalEdge = 0.0;
    for (int i = 0; i < 4; i++) {
      float neighbourDepth = linearDepth(texel + offsets[i]);
      float diff = neighbourDepth - depth;
      depthEdge += clamp(diff - 0.35, 0.0, 1.0);
      vec3 neighbourNormal = viewNormal(texel + offsets[i]);
      float facing = smoothstep(-0.05, 0.05, diff + 0.02);
      normalEdge += (1.0 - clamp(dot(normal, neighbourNormal), 0.0, 1.0)) * facing;
    }

    if (depthEdge > 0.0) {
      color *= outlineDarken;
    } else if (normalEdge > 0.35) {
      color = min(color * highlightBoost + 0.03, vec3(1.0));
    }

    // Encode to sRGB first so the quantisation steps are perceptually even, then ordered-dither while quantising —
    // keeps gradients (shadow falloff, fog) reading as pixel art. Output is already sRGB, so no colorspace chunk.
    color = clamp(color, 0.0, 1.0);
    color = mix(pow(color, vec3(1.0 / 2.4)) * 1.055 - 0.055, color * 12.92, vec3(lessThanEqual(color, vec3(0.0031308))));
    float threshold = bayer4(texel) - 0.5;
    color = floor(color * ditherLevels + 0.5 + threshold) / ditherLevels;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export class PixelPipeline {
  private readonly colorTarget: THREE.WebGLRenderTarget;
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly compositeScene = new THREE.Scene();
  private readonly compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly compositeMaterial: THREE.ShaderMaterial;
  layout: PipelineLayout = envelopeLayout(MAX_INTERNAL_WIDTH, MAX_INTERNAL_HEIGHT);
  private canvasWidth = MAX_INTERNAL_WIDTH;
  private canvasHeight = MAX_INTERNAL_HEIGHT;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const targetOptions: THREE.RenderTargetOptions = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, type: THREE.HalfFloatType };
    const targetWidth = MAX_INTERNAL_WIDTH + INTERNAL_PADDING * 2;
    const targetHeight = MAX_INTERNAL_HEIGHT + INTERNAL_PADDING * 2;
    this.colorTarget = new THREE.WebGLRenderTarget(targetWidth, targetHeight, { ...targetOptions, depthTexture: new THREE.DepthTexture(targetWidth, targetHeight) });
    this.colorTarget.depthTexture!.minFilter = THREE.NearestFilter;
    this.colorTarget.depthTexture!.magFilter = THREE.NearestFilter;
    this.normalTarget = new THREE.WebGLRenderTarget(targetWidth, targetHeight, targetOptions);
    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: this.colorTarget.depthTexture },
        targetSize: { value: new THREE.Vector2(targetWidth, targetHeight) },
        viewportOrigin: { value: new THREE.Vector2() },
        pixelScale: { value: 1 },
        subTexelOffset: { value: new THREE.Vector2() },
        padding: { value: INTERNAL_PADDING },
        depthRange: { value: 1 },
        outlineDarken: { value: 0.55 },
        highlightBoost: { value: 1.3 },
        ditherLevels: { value: 28 }
      },
      depthTest: false,
      depthWrite: false
    });
    this.compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial));
  }

  /** Re-fits to a canvas of `width`×`height` device pixels and resizes the low-res targets to match. */
  resize(width: number, height: number): PipelineLayout {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.layout = envelopeLayout(width, height);
    const targetWidth = this.layout.internalWidth + INTERNAL_PADDING * 2;
    const targetHeight = this.layout.internalHeight + INTERNAL_PADDING * 2;
    this.colorTarget.setSize(targetWidth, targetHeight);
    this.normalTarget.setSize(targetWidth, targetHeight);
    (this.compositeMaterial.uniforms.targetSize.value as THREE.Vector2).set(targetWidth, targetHeight);
    return this.layout;
  }

  /** `hideInNormalPass` objects (transparent blob shadows, particles) are skipped while normals are drawn so they
   *  don't create fake edges. */
  render(scene: THREE.Scene, camera: THREE.OrthographicCamera, subTexelOffset: THREE.Vector2, hideInNormalPass: THREE.Object3D[]): void {
    const { renderer } = this;
    renderer.setRenderTarget(this.colorTarget);
    renderer.clear();
    renderer.render(scene, camera);

    const previousBackground = scene.background;
    const visibility = hideInNormalPass.map((object) => object.visible);
    hideInNormalPass.forEach((object) => { object.visible = false; });
    scene.overrideMaterial = this.normalMaterial;
    scene.background = null;
    renderer.setRenderTarget(this.normalTarget);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = previousBackground;
    hideInNormalPass.forEach((object, index) => { object.visible = visibility[index]; });

    const uniforms = this.compositeMaterial.uniforms;
    const { layout } = this;
    uniforms.depthRange.value = camera.far - camera.near;
    uniforms.pixelScale.value = layout.pixelScale;
    (uniforms.viewportOrigin.value as THREE.Vector2).set(layout.originX, layout.originY);
    (uniforms.subTexelOffset.value as THREE.Vector2).copy(subTexelOffset);

    renderer.setRenderTarget(null);
    renderer.setClearColor(0x0d0b14, 1);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setViewport(0, 0, this.canvasWidth, this.canvasHeight);
    renderer.render(this.compositeScene, this.compositeCamera);
  }

  dispose(): void {
    this.colorTarget.dispose();
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
