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
import { layout as pretextLayout, prepareWithSegments, walkLineRanges, } from '@chenglou/pretext';
const compiledDescriptorCache = new WeakMap();
function resolveSides(v) {
    if (v === undefined)
        return { top: 0, right: 0, bottom: 0, left: 0 };
    if (typeof v === 'number')
        return { top: v, right: v, bottom: v, left: v };
    return { top: v.top ?? 0, right: v.right ?? 0, bottom: v.bottom ?? 0, left: v.left ?? 0 };
}
function isCompiledDescriptor(value) {
    return value.__compiled === true;
}
function isLeaf(desc) {
    if (desc.leaf === true)
        return true;
    if (desc.text !== undefined)
        return true;
    if (desc.height !== undefined && (!desc.children || desc.children.length === 0))
        return true;
    if (desc.aspectRatio !== undefined && (!desc.children || desc.children.length === 0))
        return true;
    return false;
}
function getIntrinsicTextWidth(prepared) {
    let intrinsicWidth = 0;
    walkLineRanges(prepared, Number.MAX_SAFE_INTEGER, line => {
        if (line.width > intrinsicWidth)
            intrinsicWidth = line.width;
    });
    return intrinsicWidth;
}
function fingerprintSides(v) {
    const resolved = resolveSides(v);
    return `${resolved.top},${resolved.right},${resolved.bottom},${resolved.left}`;
}
function fingerprintValue(value) {
    if (value === undefined)
        return '';
    return String(value);
}
function fingerprintDescriptor(desc) {
    const children = desc.children ?? [];
    return [
        fingerprintValue(desc.display ?? 'block'),
        fingerprintValue(desc.flexDirection ?? 'row'),
        fingerprintValue(desc.alignItems),
        fingerprintValue(desc.justifyContent),
        fingerprintValue(desc.width),
        fingerprintValue(desc.height),
        fingerprintValue(desc.aspectRatio),
        fingerprintSides(desc.padding),
        fingerprintSides(desc.margin),
        fingerprintValue(desc.gap),
        fingerprintValue(desc.rowGap),
        fingerprintValue(desc.columnGap),
        fingerprintValue(desc.borderRadius),
        fingerprintValue(desc.font),
        fingerprintValue(desc.lineHeight),
        fingerprintValue(desc.text),
        fingerprintValue(desc.maxWidth),
        fingerprintValue(desc.leaf),
        `${children.length}[${children.map(fingerprintDescriptor).join('|')}]`,
    ].join('::');
}
function ensureFreshCompiled(desc) {
    const nextFingerprint = fingerprintDescriptor(desc.source);
    if (nextFingerprint === desc.sourceFingerprint)
        return desc;
    return compileDescriptor(desc.source);
}
/**
 * Compile a descriptor into a prepared tree with cached text metrics and
 * per-width subtree layout caches. If the source descriptor mutates later,
 * the next compile/layout call will rebuild the compiled tree automatically.
 */
export function compileDescriptor(desc) {
    if (isCompiledDescriptor(desc))
        return ensureFreshCompiled(desc);
    const cached = compiledDescriptorCache.get(desc);
    if (cached) {
        const nextFingerprint = fingerprintDescriptor(desc);
        if (cached.sourceFingerprint === nextFingerprint)
            return cached;
    }
    const sourceFingerprint = fingerprintDescriptor(desc);
    const padding = resolveSides(desc.padding);
    const margin = resolveSides(desc.margin);
    const textMetrics = desc.text && desc.font && desc.lineHeight
        ? (() => {
            const prepared = prepareWithSegments(desc.text, desc.font);
            return {
                prepared,
                intrinsicWidth: getIntrinsicTextWidth(prepared) + padding.left + padding.right,
                singleLineThreshold: desc.lineHeight * 1.5,
                lineHeight: desc.lineHeight,
            };
        })()
        : undefined;
    const compiled = {
        __compiled: true,
        source: desc,
        sourceFingerprint,
        padding,
        margin,
        display: desc.display ?? 'block',
        flexDirection: desc.flexDirection ?? 'row',
        width: desc.width,
        height: desc.height,
        aspectRatio: desc.aspectRatio,
        maxWidth: desc.maxWidth,
        borderRadius: desc.borderRadius,
        leaf: isLeaf(desc),
        contentSized: desc.width === undefined && (textMetrics !== undefined || desc.leaf === true),
        children: (desc.children ?? []).map(child => compileDescriptor(child)),
        textMetrics,
        layoutCache: new Map(),
    };
    compiledDescriptorCache.set(desc, compiled);
    return compiled;
}
/**
 * Explicitly clear the cached compiled tree for a descriptor. Most callers do
 * not need this because mutation detection refreshes automatically, but it is
 * useful when a caller wants to force a rebuild immediately.
 */
export function invalidateDescriptor(desc) {
    const source = isCompiledDescriptor(desc) ? desc.source : desc;
    compiledDescriptorCache.delete(source);
}
/**
 * Compute skeleton bones from a descriptor at a given width.
 * Pass a compiled descriptor to reuse the cold work across relayouts.
 */
export function computeLayout(input, width, name = 'component') {
    const compiled = compileDescriptor(input);
    const fragment = layoutCompiledNode(compiled, width);
    const bones = cloneBones(fragment.bones);
    let maxBottom = 0;
    for (const b of bones) {
        const bottom = b.y + b.h;
        if (bottom > maxBottom)
            maxBottom = bottom;
    }
    return {
        name,
        viewportWidth: width,
        width,
        height: round(maxBottom),
        bones,
    };
}
function layoutCompiledNode(desc, availableWidth) {
    const cacheKey = normalizeWidthKey(availableWidth);
    const cached = desc.layoutCache.get(cacheKey);
    if (cached)
        return cached;
    const fragment = computeLayoutFragment(desc, cacheKey);
    desc.layoutCache.set(cacheKey, fragment);
    return fragment;
}
function computeLayoutFragment(desc, availableWidth) {
    const pad = desc.padding;
    const mar = desc.margin;
    const nodeX = mar.left;
    const nodeY = mar.top;
    const nodeWidth = clampWidth(desc.width !== undefined ? Math.min(desc.width, availableWidth) : availableWidth, desc.maxWidth);
    const contentX = nodeX + pad.left;
    const contentY = nodeY + pad.top;
    const contentWidth = Math.max(0, nodeWidth - pad.left - pad.right);
    if (desc.leaf) {
        const contentHeight = resolveLeafHeight(desc, contentWidth);
        const totalHeight = contentHeight + pad.top + pad.bottom;
        let boneWidth = nodeWidth;
        if (desc.textMetrics && contentHeight < desc.textMetrics.singleLineThreshold) {
            boneWidth = Math.min(desc.textMetrics.intrinsicWidth, nodeWidth);
        }
        return {
            height: totalHeight + mar.top + mar.bottom,
            bones: [{
                    x: round(nodeX),
                    y: round(nodeY),
                    w: round(boneWidth),
                    h: round(totalHeight),
                    r: desc.borderRadius ?? 8,
                }],
        };
    }
    let innerHeight = 0;
    let childBones = [];
    if (desc.display === 'flex' && desc.flexDirection === 'row') {
        const row = layoutFlexRow(desc, contentWidth);
        innerHeight = row.height;
        childBones = offsetBones(row.bones, contentX, contentY);
    }
    else if (desc.display === 'flex' && desc.flexDirection === 'column') {
        const column = layoutFlexColumn(desc, contentWidth);
        innerHeight = column.height;
        childBones = offsetBones(column.bones, contentX, contentY);
    }
    else {
        const block = layoutBlock(desc, contentWidth);
        innerHeight = block.height;
        childBones = offsetBones(block.bones, contentX, contentY);
    }
    return {
        height: innerHeight + pad.top + pad.bottom + mar.top + mar.bottom,
        bones: childBones,
    };
}
function layoutBlock(parent, contentWidth) {
    let y = 0;
    let prevMarBottom = 0;
    let prevIsText = false;
    const bones = [];
    for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        const isText = !!child.textMetrics;
        if (i > 0) {
            y -= Math.min(prevMarBottom, child.margin.top);
            // Ensure minimum visual gap between consecutive text blocks (paragraph spacing)
            const effectiveGap = Math.max(prevMarBottom, child.margin.top);
            if (prevIsText && isText && effectiveGap < 8) {
                y += 8 - effectiveGap;
            }
        }
        const childFragment = layoutCompiledNode(child, contentWidth);
        bones.push(...offsetBones(childFragment.bones, 0, y));
        y += childFragment.height;
        prevMarBottom = child.margin.bottom;
        prevIsText = isText;
    }
    return { height: y, bones };
}
function layoutFlexColumn(parent, contentWidth) {
    const gap = parent.source.rowGap ?? parent.source.gap ?? 0;
    let y = 0;
    const bones = [];
    for (let i = 0; i < parent.children.length; i++) {
        const childFragment = layoutCompiledNode(parent.children[i], contentWidth);
        bones.push(...offsetBones(childFragment.bones, 0, y));
        y += childFragment.height;
        if (i < parent.children.length - 1 && childFragment.height > 0)
            y += gap;
    }
    return { height: y, bones };
}
function layoutFlexRow(parent, contentWidth) {
    if (parent.children.length === 0)
        return { height: 0, bones: [] };
    const gap = parent.source.columnGap ?? parent.source.gap ?? 0;
    const justify = parent.source.justifyContent ?? 'flex-start';
    const align = parent.source.alignItems ?? 'stretch';
    const childWidths = [];
    let totalFixed = 0;
    let flexCount = 0;
    for (const child of parent.children) {
        if (child.width !== undefined) {
            const width = clampWidth(child.width, child.maxWidth);
            childWidths.push(width);
            totalFixed += width;
            continue;
        }
        if (child.contentSized) {
            const width = clampWidth(getIntrinsicWidth(child, contentWidth), child.maxWidth);
            childWidths.push(width);
            totalFixed += width;
            continue;
        }
        childWidths.push(-1);
        flexCount++;
    }
    const totalGaps = Math.max(0, parent.children.length - 1) * gap;
    const remaining = Math.max(0, contentWidth - totalFixed - totalGaps);
    const flexWidth = flexCount > 0 ? remaining / flexCount : 0;
    for (let i = 0; i < childWidths.length; i++) {
        if (childWidths[i] < 0) {
            childWidths[i] = clampWidth(flexWidth, parent.children[i].maxWidth);
        }
    }
    const childFragments = childWidths.map((width, index) => layoutCompiledNode(parent.children[index], width));
    const maxHeight = Math.max(0, ...childFragments.map(fragment => fragment.height));
    const totalUsed = childWidths.reduce((sum, width) => sum + width, 0) + totalGaps;
    let xStart = 0;
    let extraGap = 0;
    if (justify === 'flex-end') {
        xStart = Math.max(0, contentWidth - totalUsed);
    }
    else if (justify === 'center') {
        xStart = Math.max(0, (contentWidth - totalUsed) / 2);
    }
    else if (justify === 'space-between' && parent.children.length > 1) {
        const totalChildWidth = childWidths.reduce((sum, width) => sum + width, 0);
        extraGap = Math.max(0, (contentWidth - totalChildWidth) / (parent.children.length - 1)) - gap;
    }
    const bones = [];
    let x = xStart;
    for (let i = 0; i < childFragments.length; i++) {
        let yOff = 0;
        if (align === 'center')
            yOff = Math.max(0, (maxHeight - childFragments[i].height) / 2);
        else if (align === 'flex-end')
            yOff = Math.max(0, maxHeight - childFragments[i].height);
        bones.push(...offsetBones(childFragments[i].bones, x, yOff));
        x += childWidths[i];
        if (i < childFragments.length - 1)
            x += gap + extraGap;
    }
    return { height: maxHeight, bones };
}
function resolveLeafHeight(desc, contentWidth) {
    if (desc.textMetrics) {
        return pretextLayout(desc.textMetrics.prepared, contentWidth, desc.textMetrics.lineHeight).height;
    }
    if (desc.height !== undefined) {
        return Math.max(0, desc.height - desc.padding.top - desc.padding.bottom);
    }
    if (desc.aspectRatio && desc.aspectRatio > 0 && isFinite(desc.aspectRatio)) {
        return contentWidth / desc.aspectRatio;
    }
    return 20;
}
function getIntrinsicWidth(desc, maxAvailable) {
    if (desc.textMetrics)
        return Math.min(desc.textMetrics.intrinsicWidth, maxAvailable);
    if (desc.width !== undefined)
        return desc.width;
    return maxAvailable;
}
function cloneBones(bones) {
    return bones.map(bone => ({ ...bone }));
}
function offsetBones(bones, dx, dy) {
    if (dx === 0 && dy === 0)
        return cloneBones(bones);
    return bones.map(bone => ({
        ...bone,
        x: round(bone.x + dx),
        y: round(bone.y + dy),
    }));
}
function clampWidth(width, maxWidth) {
    if (maxWidth === undefined)
        return width;
    return Math.min(width, maxWidth);
}
function normalizeWidthKey(width) {
    if (!isFinite(width))
        return 0;
    return Math.round(width * 1000) / 1000;
}
function round(n) {
    if (!isFinite(n))
        return 0;
    return Math.round(n * 100) / 100;
}
