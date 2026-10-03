/**
 * Layout engine for descriptor-driven skeleton generation.
 *
 * The fast path uses a compile-and-relayout architecture:
 * - compileDescriptor() does the cold work once
 * - computeLayout() reuses compiled text/layout metadata and performs arithmetic
 *
 * This keeps repeated relayouts cheap at different widths and avoids
 * re-preparing text nodes on every pass.
 */
import { type PreparedTextWithSegments } from '@chenglou/pretext';
import type { SkeletonDescriptor, Bone, SkeletonResult } from './types.js';
/** Resolved padding/margin — always four sides */
interface Sides {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
type LayoutFragment = {
    height: number;
    bones: Bone[];
};
type CompiledTextMetrics = {
    prepared: PreparedTextWithSegments;
    intrinsicWidth: number;
    singleLineThreshold: number;
    lineHeight: number;
};
export interface CompiledSkeletonDescriptor {
    readonly __compiled: true;
    readonly source: SkeletonDescriptor;
    readonly sourceFingerprint: string;
    readonly padding: Sides;
    readonly margin: Sides;
    readonly display: 'block' | 'flex';
    readonly flexDirection: 'row' | 'column';
    readonly width?: number;
    readonly height?: number;
    readonly aspectRatio?: number;
    readonly maxWidth?: number;
    readonly borderRadius?: number | string;
    readonly leaf: boolean;
    readonly contentSized: boolean;
    readonly children: CompiledSkeletonDescriptor[];
    readonly textMetrics?: CompiledTextMetrics;
    layoutCache: Map<number, LayoutFragment>;
}
/**
 * Compile a descriptor into a prepared tree with cached text metrics and
 * per-width subtree layout caches. If the source descriptor mutates later,
 * the next compile/layout call will rebuild the compiled tree automatically.
 */
export declare function compileDescriptor(desc: SkeletonDescriptor | CompiledSkeletonDescriptor): CompiledSkeletonDescriptor;
/**
 * Explicitly clear the cached compiled tree for a descriptor. Most callers do
 * not need this because mutation detection refreshes automatically, but it is
 * useful when a caller wants to force a rebuild immediately.
 */
export declare function invalidateDescriptor(desc: SkeletonDescriptor | CompiledSkeletonDescriptor): void;
/**
 * Compute skeleton bones from a descriptor at a given width.
 * Pass a compiled descriptor to reuse the cold work across relayouts.
 */
export declare function computeLayout(input: SkeletonDescriptor | CompiledSkeletonDescriptor, width: number, name?: string): SkeletonResult;
export {};
