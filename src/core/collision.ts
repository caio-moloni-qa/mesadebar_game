import { Vec2 } from './math';

/** Gameplay-plane shapes: every entity is a circle (matching today's Arcade setCircle bodies); static obstacles like
 *  the merchant room's walls and table are axis-aligned boxes (today's physics.add.collider rectangles). */
export interface Circle { x: number; y: number; radius: number; }
export interface Aabb { minX: number; minY: number; maxX: number; maxY: number; }

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = a.radius + b.radius;
  return dx * dx + dy * dy < reach * reach;
}

export function circleOverlapsAabb(circle: Circle, box: Aabb): boolean {
  const closestX = Math.min(Math.max(circle.x, box.minX), box.maxX);
  const closestY = Math.min(Math.max(circle.y, box.minY), box.maxY);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

/** Minimal translation that pushes `circle` out of `box`, or null when they don't overlap. Used for solid static
 *  colliders: add the result to the moving circle's position. */
export function resolveCircleAabb(circle: Circle, box: Aabb): Vec2 | null {
  const closestX = Math.min(Math.max(circle.x, box.minX), box.maxX);
  const closestY = Math.min(Math.max(circle.y, box.minY), box.maxY);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= circle.radius * circle.radius) return null;
  if (distSq > 0) {
    const dist = Math.sqrt(distSq);
    const push = circle.radius - dist;
    return { x: (dx / dist) * push, y: (dy / dist) * push };
  }
  // Center is inside the box: leave through the nearest face.
  const exits = [
    { x: box.minX - circle.radius - circle.x, y: 0 },
    { x: box.maxX + circle.radius - circle.x, y: 0 },
    { x: 0, y: box.minY - circle.radius - circle.y },
    { x: 0, y: box.maxY + circle.radius - circle.y }
  ];
  return exits.reduce((best, exit) => (Math.abs(exit.x) + Math.abs(exit.y) < Math.abs(best.x) + Math.abs(best.y) ? exit : best));
}
