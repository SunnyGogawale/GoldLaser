/**
 * BoneScan — Dev-only component that scans a React Native view hierarchy
 * and generates bone data from the actual native layout.
 *
 * Uses React fiber internals to walk the component tree, then calls
 * measureLayout() on each host view to capture pixel-perfect positions.
 *
 * Works with `npx boneyard-js scan` — bones are sent to the CLI automatically.
 *
 * @example
 * ```tsx
 * import { BoneScan } from 'boneyard-js/native-scan'
 *
 * // Dev screen — wrap each component you want to generate bones for
 * <BoneScan name="profile-card">
 *   <ProfileCard user={mockUser} />
 * </BoneScan>
 * ```
 *
 * Then run: npx boneyard-js scan --out ./bones
 */
import { type ReactNode } from 'react';
import type { SkeletonResult, ResponsiveBones } from './types.js';
export interface BoneScanProps {
    /** Name for this skeleton (used in the output JSON) */
    name: string;
    /** The component to scan */
    children: ReactNode;
    /** Called with the generated SkeletonResult after scanning */
    onCapture?: (result: SkeletonResult) => void;
    /**
     * Delay in ms before measuring (lets animations/layout settle).
     * Default: 500
     */
    delay?: number;
    /**
     * Use compact tuple format [x,y,w,h,r,c?] instead of objects.
     * Default: true (matches v1.6 CLI output)
     */
    compact?: boolean;
}
export declare function BoneScan({ name, children, onCapture, delay, compact, }: BoneScanProps): import("react/jsx-runtime").JSX.Element;
/**
 * Multi-breakpoint scan — renders at each width and captures bones.
 *
 * @example
 * ```tsx
 * <BoneScanResponsive name="dashboard" breakpoints={[375, 768, 1280]}>
 *   <Dashboard />
 * </BoneScanResponsive>
 * ```
 */
export declare function BoneScanResponsive({ name, children, breakpoints: bps, onCapture, delay, compact, }: {
    name: string;
    children: ReactNode;
    breakpoints?: number[];
    onCapture?: (result: ResponsiveBones) => void;
    delay?: number;
    compact?: boolean;
}): import("react/jsx-runtime").JSX.Element;
