export type { Bone, CompactBone, AnyBone, SkeletonResult, ResponsiveBones, SkeletonDescriptor, ResponsiveDescriptor, SnapshotConfig } from './types.js';
export { normalizeBone } from './types.js';
export { registerBones } from './shared.js';
export type { CompiledSkeletonDescriptor } from './layout.js';
/**
 * Snapshot exact pixel positions of a rendered element as skeleton bones.
 * Reads `getBoundingClientRect()` on every visible element — no simulation,
 * just what the browser already computed.
 *
 * Use this to pre-generate bones at dev time, save as JSON, and pass as
 * `initialBones` to `<Skeleton>` for zero first-load flash.
 *
 * @example In a browser console or dev script:
 * ```ts
 * import { snapshotBones } from 'boneyard-js'
 * const bones = snapshotBones(document.querySelector('.my-card'))
 * console.log(JSON.stringify(bones, null, 2))
 * // → paste into my-card.bones.json
 * ```
 */
export { snapshotBones } from './extract.js';
/**
 * Extract a skeleton descriptor from a rendered DOM element.
 * Captures layout structure as plain JSON — use with `computeLayout` for
 * SSR or build-time paths where a live browser DOM isn't available.
 */
export { fromElement } from './extract.js';
/**
 * Extract responsive descriptors at multiple breakpoints.
 * Resizes the container to each width, extracts a descriptor per breakpoint.
 * Returns a `ResponsiveDescriptor` you can serialize and ship as JSON.
 */
export { extractResponsive } from './responsive.js';
/**
 * Compute skeleton bone positions from a descriptor at a given width.
 * No DOM needed — works in SSR, workers, and edge functions.
 */
export { compileDescriptor, computeLayout, invalidateDescriptor } from './layout.js';
/**
 * Render a `SkeletonResult` to an HTML string.
 * Use for `innerHTML`, SSR, edge functions, etc.
 */
export { renderBones } from './runtime.js';
/**
 * All-in-one convenience: extract descriptor → compute layout → render HTML.
 *
 *   container.innerHTML = skeleton(element)
 *
 * For React, prefer `<Skeleton>` from 'boneyard-js/react' — it calls
 * `snapshotBones()` directly and handles caching automatically.
 */
export declare function skeleton(el: Element, options?: {
    width?: number;
    color?: string;
    animate?: boolean;
}): string;
