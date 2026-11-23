// Reads CSS scroll-snap declarations (computed style) and resolves horizontal snap positions.
// - CSS is the single source of truth; no JS snap configuration needed

export type SnapStrictness = 'mandatory' | 'proximity';

export interface SnapPoint {
    position: number;
    stopAlways: boolean;
}

export interface SnapArea extends SnapPoint {
    element: Element;
}

/** Fired on the scroller when a JS-driven scroll (drag release, page button, scrollToIndex) picks its target. */
export const SNAP_TARGET_EVENT = 'snapdragscroll:target';

export const dispatchSnapTarget = (scroller: HTMLElement, left: number) => {
    scroller.dispatchEvent(new CustomEvent(SNAP_TARGET_EVENT, { detail: { left } }));
};

/** Asks the drag controller to stop momentum/snap animation and restore CSS snap before an external scroll. */
export const SNAP_INTERRUPT_EVENT = 'snapdragscroll:interrupt';

export const dispatchSnapInterrupt = (scroller: HTMLElement) => {
    scroller.dispatchEvent(new CustomEvent(SNAP_INTERRUPT_EVENT));
};

// proximity threshold as a ratio of the snapport width — approximation, browsers differ
const PROXIMITY_RATIO = 0.3;
// positions closer than this (px) are treated as the same point
const POSITION_EPSILON = 0.5;

const toPx = (value = '') => {
    const px = parseFloat(value);
    return Number.isNaN(px) ? 0 : px;
};

/** Horizontal snap strictness from `scroll-snap-type` (null if the x axis is not snapped). */
export const getSnapStrictness = (scrollSnapType = ''): SnapStrictness | null => {
    const [axis, strictness] = scrollSnapType.trim().split(/\s+/);
    if (!['x', 'inline', 'both'].includes(axis)) return null;
    return strictness === 'mandatory' ? 'mandatory' : 'proximity';
};

/** Inline-axis value of `scroll-snap-align` — with two values the second one is inline. */
export const getInlineSnapAlign = (scrollSnapAlign = '') => {
    const values = scrollSnapAlign.trim().split(/\s+/);
    return values[1] || values[0] || 'none';
};

const isScrollContainer = (style: CSSStyleDeclaration) =>
    [style.overflowX, style.overflowY].some((value) =>
        ['auto', 'scroll', 'hidden'].includes(value)
    );

/** Snap position of every snap area (DOM order, clamped to [0, maxScroll], duplicates kept). */
export const getSnapAreas = (scroller: HTMLElement): SnapArea[] => {
    const scrollerStyle = getComputedStyle(scroller);
    const paddingLeft = toPx(scrollerStyle.scrollPaddingLeft);
    const paddingRight = toPx(scrollerStyle.scrollPaddingRight);
    const snapportWidth = scroller.clientWidth - paddingLeft - paddingRight;
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    // viewport x of the scroll content origin
    const originX =
        scroller.getBoundingClientRect().left + scroller.clientLeft - scroller.scrollLeft;

    const areas: SnapArea[] = [];

    const collect = (parent: Element) => {
        Array.from(parent.children).forEach((el) => {
            const style = getComputedStyle(el);
            if (style.display === 'none') return;

            const align = getInlineSnapAlign(style.scrollSnapAlign);
            if (align === 'none') {
                // descendants of a nested scroll container belong to that container
                if (!isScrollContainer(style)) collect(el);
                return;
            }

            const rect = el.getBoundingClientRect();
            const areaLeft = rect.left - originX - toPx(style.scrollMarginLeft);
            const areaRight = rect.right - originX + toPx(style.scrollMarginRight);

            let position = areaLeft - paddingLeft;
            if (align === 'end') position = areaRight - (paddingLeft + snapportWidth);
            if (align === 'center') {
                position = (areaLeft + areaRight) / 2 - (paddingLeft + snapportWidth / 2);
            }

            areas.push({
                element: el,
                position: Math.min(Math.max(position, 0), maxScroll),
                stopAlways: style.scrollSnapStop === 'always'
            });
        });
    };
    collect(scroller);
    return areas;
};

/** Merges snap areas into sorted, de-duplicated snap points. */
export const mergeSnapAreas = (areas: SnapPoint[]): SnapPoint[] =>
    [...areas]
        .sort((a, b) => a.position - b.position)
        .reduce<SnapPoint[]>((acc, point) => {
            const last = acc[acc.length - 1];
            if (last && point.position - last.position < POSITION_EPSILON) {
                last.stopAlways = last.stopAlways || point.stopAlways;
            } else {
                acc.push({ position: point.position, stopAlways: point.stopAlways });
            }
            return acc;
        }, []);

/** Snap points of a scroller in `scrollLeft` coordinates. */
export const getSnapPoints = (scroller: HTMLElement): SnapPoint[] =>
    mergeSnapAreas(getSnapAreas(scroller));

export interface ResolveSnapTargetParams {
    points: SnapPoint[];
    current: number;
    /** Expected position where momentum would stop */
    projected: number;
    strictness: SnapStrictness;
    snapportWidth: number;
    /** Scroll start position used for `scroll-snap-stop` (defaults to `current`) */
    origin?: number;
}

/**
 * Snap point closest to the projected momentum position (null if nothing to snap to).
 * - While flinging, only points in the fling direction are candidates — no backtracking, like native snap
 * - `scroll-snap-stop: always` points are never skipped relative to the scroll start (one step at a time)
 *   - dragging past that point and releasing returns to it (native behavior)
 */
export const resolveSnapTarget = ({
    points,
    current,
    projected,
    strictness,
    snapportWidth,
    origin = current
}: ResolveSnapTargetParams): number | null => {
    if (!points.length) return null;

    const flingDirection = Math.sign(projected - current);
    const forwardPoints = flingDirection
        ? points.filter(({ position }) => (position - current) * flingDirection > -POSITION_EPSILON)
        : [];
    // no point ahead (past the last one) → all points are candidates
    const candidates = forwardPoints.length ? forwardPoints : points;

    const nearest = candidates.reduce((prev, point) =>
        Math.abs(point.position - projected) < Math.abs(prev.position - projected) ? point : prev
    ).position;

    if (
        strictness === 'proximity' &&
        Math.abs(nearest - projected) > snapportWidth * PROXIMITY_RATIO
    ) {
        return null;
    }

    const direction = Math.sign(nearest - origin);
    if (!direction) return nearest;

    const stopPoint = points
        .filter(
            ({ position, stopAlways }) =>
                stopAlways &&
                (position - origin) * direction > POSITION_EPSILON &&
                (nearest - position) * direction > POSITION_EPSILON
        )
        .sort((a, b) => Math.abs(a.position - origin) - Math.abs(b.position - origin))[0];

    return stopPoint ? stopPoint.position : nearest;
};

export type PageDirection = 'prev' | 'next';

export interface ResolvePageSnapTargetParams {
    points: SnapPoint[];
    current: number;
    /** Distance of one page (visible width of the scroller) */
    pageWidth: number;
    direction: PageDirection;
}

/**
 * Snap point for a one-page move (null if there is no point in that direction).
 * - next: the item cut off at the trailing edge becomes the first item
 * - prev: the item right before the current first item becomes the last item
 * - no point within one page (item wider than the viewport) → the very next point
 */
export const resolvePageSnapTarget = ({
    points,
    current,
    pageWidth,
    direction
}: ResolvePageSnapTargetParams): number | null => {
    const sign = direction === 'next' ? 1 : -1;
    const forward = points
        .map(({ position }) => position)
        .filter((position) => (position - current) * sign > POSITION_EPSILON)
        .sort((a, b) => (a - b) * sign);
    if (!forward.length) return null;

    const withinPage = forward.filter(
        (position) => Math.abs(position - current) <= pageWidth + POSITION_EPSILON
    );
    return withinPage.length ? withinPage[withinPage.length - 1] : forward[0];
};

/** One-page snap target of a scroller (null if snap is not applied or no target). */
export const getPageSnapTarget = (scroller: HTMLElement, direction: PageDirection) => {
    if (!getSnapStrictness(getComputedStyle(scroller).scrollSnapType)) return null;
    return resolvePageSnapTarget({
        points: getSnapPoints(scroller),
        current: scroller.scrollLeft,
        pageWidth: scroller.clientWidth,
        direction
    });
};

/** Index of the snap position closest to `scrollLeft` (0 if empty). */
export const findNearestSnapIndex = (positions: number[], scrollLeft: number) =>
    positions.reduce(
        (nearest, position, index) =>
            Math.abs(position - scrollLeft) < Math.abs(positions[nearest] - scrollLeft)
                ? index
                : nearest,
        0
    );
