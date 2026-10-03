import { type ReactNode } from 'react';
import type { SkeletonResult, ResponsiveBones, SnapshotConfig, AnimationStyle } from './types.js';
import { registerBones } from './shared.js';
export { registerBones };
export type { AnimationStyle };
interface BoneyardConfig {
    color?: string;
    darkColor?: string;
    animate?: AnimationStyle;
    stagger?: number | boolean;
    transition?: number | boolean;
    boneClass?: string;
    /** Shimmer highlight color (light mode). Default: '#f2f2f2' */
    shimmerColor?: string;
    /** Shimmer highlight color (dark mode). Default: '#282828' */
    darkShimmerColor?: string;
    /** Animation duration, e.g. '2s' or '1.5s'. Applies to the active animation style. */
    speed?: string;
    /** Shimmer gradient angle in degrees. Default: 110 */
    shimmerAngle?: number;
    /**
     * Which width picks the responsive breakpoint at runtime:
     * - `'container'` (default): the skeleton container's measured width — matches
     *   the space the skeleton actually occupies (container-query-like).
     * - `'viewport'`: `window.innerWidth` — matches how the CLI keys captures
     *   (by viewport width). Use this when the container is narrower than the
     *   viewport (app-shell layouts) and container-width selection picks a
     *   breakpoint captured under a different layout. See #92.
     */
    select?: 'container' | 'viewport';
}
/**
 * Set global defaults for all `<Skeleton>` components.
 * Individual props override these defaults.
 *
 * ```ts
 * import { configureBoneyard } from 'boneyard-js/react'
 *
 * configureBoneyard({
 *   color: '#e5e5e5',
 *   darkColor: '#2a2a2a',
 *   animate: true,
 * })
 * ```
 */
export declare function configureBoneyard(config: BoneyardConfig): void;
export interface SkeletonProps {
    /** When true, shows the skeleton. When false, shows children. */
    loading: boolean;
    /** Your component — rendered when not loading. */
    children: ReactNode;
    /**
     * Name this skeleton. Used by `npx boneyard-js build` to identify and capture bones.
     * Also used to auto-resolve pre-generated bones from the registry.
     */
    name?: string;
    /**
     * Pre-generated bones. Accepts a single `SkeletonResult` or a `ResponsiveBones` map.
     */
    initialBones?: SkeletonResult | ResponsiveBones;
    /** Bone fill color — any CSS color value (default: '#f0f0f0') */
    color?: string;
    /** Bone fill color for dark mode (default: '#222222'). Used when a .dark ancestor exists. */
    darkColor?: string;
    /** Animation style: 'pulse' (default), 'shimmer', 'solid', or boolean (true = pulse, false = solid) */
    animate?: AnimationStyle;
    /** Stagger animation delay between bones in ms (default: false, true = 80ms) */
    stagger?: number | boolean;
    /** Fade transition duration in ms when skeleton hides (default: false, true = 300ms) */
    transition?: number | boolean;
    /** CSS class applied to each bone element */
    boneClass?: string;
    /** Additional className for the container */
    className?: string;
    /**
     * Shown when loading is true and no bones are available.
     */
    fallback?: ReactNode;
    /**
     * Mock content rendered during `npx boneyard-js build` so the CLI can capture
     * bone positions even when real data isn't available.
     * Only rendered when the CLI sets `window.__BONEYARD_BUILD = true`.
     */
    fixture?: ReactNode;
    /**
     * Controls how `npx boneyard-js build` extracts bones from the fixture.
     * Stored as a data attribute — the CLI reads it during capture.
     */
    snapshotConfig?: SnapshotConfig;
    /**
     * Which width selects the responsive breakpoint: `'container'` (default,
     * the skeleton's measured width) or `'viewport'` (`window.innerWidth`, how
     * the CLI keys captures). Use `'viewport'` for app-shell layouts where the
     * container is narrower than the window. See #92.
     */
    select?: 'container' | 'viewport';
}
/**
 * Wrap any component to get automatic skeleton loading screens.
 *
 * 1. Run `npx boneyard-js build` — captures bone positions from your rendered UI
 * 2. Import the generated registry in your app entry
 * 3. `<Skeleton name="..." loading={isLoading}>` auto-resolves bones by name
 */
export declare function Skeleton({ loading, children, name, initialBones, color, darkColor, animate, stagger, transition, boneClass, className, fallback, fixture, snapshotConfig, select, }: SkeletonProps): import("react/jsx-runtime").JSX.Element;
export interface BoneSuspenseProps extends Omit<SkeletonProps, 'loading'> {
    /** Component(s) that suspend — typically using `useSuspenseQuery` or `React.lazy`. */
    children: ReactNode;
}
/**
 * Suspense-aware skeleton wrapper. Use with React's `<Suspense>` model —
 * components that throw promises (e.g., `useSuspenseQuery`) suspend, and a
 * `<Skeleton>` is shown as the fallback.
 *
 * ```tsx
 * <BoneSuspense name="user-card">
 *   <UserCard />  // uses useSuspenseQuery
 * </BoneSuspense>
 * ```
 *
 * At runtime, behaves like `<Suspense fallback={<Skeleton name="..." loading />}>`.
 *
 * At build time (`npx boneyard-js build`), wraps children in `<Suspense>` so a
 * suspending query doesn't crash extraction. The CLI's `--wait` window lets the
 * query resolve naturally; the resolved DOM is then snapshotted. Pass `fixture`
 * for a build-time fallback if the query can't resolve in the wait window.
 */
export declare function BoneSuspense({ children, name, initialBones, color, darkColor, animate, stagger, transition, boneClass, className, fallback, fixture, snapshotConfig, select, }: BoneSuspenseProps): import("react/jsx-runtime").JSX.Element;
