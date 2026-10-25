import * as THREE from 'three';
import { INTERNAL_PADDING, MAX_INTERNAL_HEIGHT, MAX_INTERNAL_WIDTH, METERS_PER_TEXEL } from './PixelPipeline';

/** Isometric-style orthographic camera from the style reference: 45° yaw (world reads diagonally), ~45° pitch.
 *  At most 40 m (= 1280 game units, same width as the 2D build) across the ≤640 px internal image → 16 px per meter.
 *  Position is snapped to the internal texel grid every frame so static geometry never "swims"; the leftover
 *  sub-texel offset is handed to the upscale pass, which shifts the final image smoothly instead. */
export const CAMERA_YAW = THREE.MathUtils.degToRad(45);
export const CAMERA_PITCH = THREE.MathUtils.degToRad(45);
const CAMERA_DISTANCE = 60;
const FOLLOW_SHARPNESS = 10;

export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  /** Sub-texel offset (in internal pixels) between the ideal camera and the snapped one — feed to PixelPipeline. */
  readonly subTexelOffset = new THREE.Vector2();
  private readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly groundForward = new THREE.Vector3();
  private readonly viewDir = new THREE.Vector3();
  private initialized = false;
  /** Debug close-up (?zoom=3): fewer meters per texel, same pixel look — for reviewing models up close. */
  private readonly metersPerTexel: number;

  constructor(zoom = 1) {
    this.metersPerTexel = METERS_PER_TEXEL / zoom;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
    this.setViewSize(MAX_INTERNAL_WIDTH, MAX_INTERNAL_HEIGHT);
    this.offset.set(
      Math.cos(CAMERA_PITCH) * Math.sin(CAMERA_YAW),
      Math.sin(CAMERA_PITCH),
      Math.cos(CAMERA_PITCH) * Math.cos(CAMERA_YAW)
    ).multiplyScalar(CAMERA_DISTANCE);
    this.camera.position.copy(this.offset);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    this.groundForward.copy(this.offset).setY(0).normalize().negate();
  }

  /** Sizes the frustum to the pipeline's internal resolution (plus its padding border) at a fixed meters-per-texel. */
  setViewSize(internalWidth: number, internalHeight: number): void {
    const halfWidth = ((internalWidth + INTERNAL_PADDING * 2) * this.metersPerTexel) / 2;
    const halfHeight = ((internalHeight + INTERNAL_PADDING * 2) * this.metersPerTexel) / 2;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  /** Eases the look-at point towards `focus` (meters) and re-snaps the camera. `deltaSeconds` = frame time. */
  follow(focus: THREE.Vector3, deltaSeconds: number): void {
    if (!this.initialized) {
      this.target.copy(focus);
      this.initialized = true;
    } else {
      this.target.lerp(focus, 1 - Math.exp(-FOLLOW_SHARPNESS * deltaSeconds));
    }
    // Snap the target's position along the camera's screen axes to whole texels.
    const alongRight = this.target.dot(this.right);
    const alongUp = this.target.dot(this.up);
    const texel = this.metersPerTexel;
    const snappedRight = Math.round(alongRight / texel) * texel;
    const snappedUp = Math.round(alongUp / texel) * texel;
    this.subTexelOffset.set((alongRight - snappedRight) / texel, (alongUp - snappedUp) / texel);
    this.camera.position.copy(this.target)
      .addScaledVector(this.right, snappedRight - alongRight)
      .addScaledVector(this.up, snappedUp - alongUp)
      .add(this.offset);
    this.camera.updateMatrixWorld();
  }

  get focus(): THREE.Vector3 {
    return this.target;
  }

  /** Unit vector the camera looks along (towards the ground). */
  get viewDirection(): THREE.Vector3 {
    return this.viewDir.copy(this.offset).normalize().negate();
  }

  /** Converts screen-relative input (x right, y up; e.g. WASD) into a game-plane direction, so W always moves
   *  "up the screen" even though the world is rotated 45°. Returns sim-space (x, y) = world (X, Z). */
  screenToGround(inputX: number, inputY: number): { x: number; y: number } {
    return {
      x: this.right.x * inputX + this.groundForward.x * inputY,
      y: this.right.z * inputX + this.groundForward.z * inputY
    };
  }
}
