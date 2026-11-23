import { dispatchSnapInterrupt, dispatchSnapTarget, getPageSnapTarget, PageDirection } from './snap';

export interface Pager {
    prev(): void;
    next(): void;
    destroy(): void;
}

export interface ScrollEdges {
    /** Scrolled to the very start (nothing to the left) */
    atStart: boolean;
    /** Scrolled to the very end (nothing to the right) */
    atEnd: boolean;
}

export interface ScrollEdgesObserver {
    readonly edges: ScrollEdges;
    destroy(): void;
}

// arrival / edge tolerance (px) — absorbs fractional scrollLeft
const EDGE_EPSILON = 1;
// a page move is considered in-flight at most this long (ms) — guards against a missing scrollend
const MAX_MOVE_MS = 1000;

/**
 * Page-by-page navigation for prev / next buttons.
 * - With CSS snap: moves to snap points so the item cut off at the edge is never skipped
 * - Without snap: moves by the visible width
 * - Repeated input in the same direction is ignored while moving; the opposite direction switches immediately
 */
export const createPager = (scroller: HTMLElement): Pager => {
    let pending: { direction: PageDirection; left: number; startedAt: number } | null = null;

    // clear on arrival or when the user takes over
    const clearPending = () => {
        pending = null;
    };
    const events = ['scrollend', 'pointerdown', 'touchstart', 'wheel'];
    events.forEach((event) =>
        scroller.addEventListener(event, clearPending, { passive: true })
    );

    const isSameDirectionMoving = (direction: PageDirection) => {
        if (!pending || pending.direction !== direction) return false;
        const isArrived = Math.abs(scroller.scrollLeft - pending.left) <= EDGE_EPSILON;
        const isExpired = performance.now() - pending.startedAt > MAX_MOVE_MS;
        return !isArrived && !isExpired;
    };

    const go = (direction: PageDirection) => {
        if (isSameDirectionMoving(direction)) return;

        // stop drag momentum / snap animation and restore CSS snap
        dispatchSnapInterrupt(scroller);

        // moving by the visible width with snap would let the browser re-snap and skip the cut-off item
        const snapTarget = getPageSnapTarget(scroller, direction);
        if (snapTarget !== null) dispatchSnapTarget(scroller, snapTarget);
        const offset = scroller.clientWidth;
        const maxScroll = scroller.scrollWidth - scroller.clientWidth;
        const left =
            snapTarget ??
            Math.min(
                Math.max(scroller.scrollLeft + (direction === 'next' ? offset : -offset), 0),
                maxScroll
            );
        pending = { direction, left, startedAt: performance.now() };
        scroller.scrollTo({ left, behavior: 'smooth' });
    };

    return {
        prev: () => go('prev'),
        next: () => go('next'),
        destroy() {
            events.forEach((event) => scroller.removeEventListener(event, clearPending));
        }
    };
};

export const getScrollEdges = (scroller: HTMLElement): ScrollEdges => {
    const { scrollLeft, clientWidth, scrollWidth } = scroller;
    return {
        atStart: scrollLeft <= EDGE_EPSILON,
        atEnd: scrollLeft + clientWidth >= scrollWidth - EDGE_EPSILON
    };
};

/** Watches whether the scroller is at its start / end — for toggling prev / next buttons or edge fades. */
export const observeScrollEdges = (
    scroller: HTMLElement,
    onChange?: (edges: ScrollEdges) => void
): ScrollEdgesObserver => {
    let edges = getScrollEdges(scroller);

    const update = () => {
        const next = getScrollEdges(scroller);
        if (next.atStart === edges.atStart && next.atEnd === edges.atEnd) return;
        edges = next;
        onChange?.(edges);
    };

    scroller.addEventListener('scroll', update, { passive: true });
    const resizeObserver =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resizeObserver?.observe(scroller);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(scroller, { childList: true, subtree: true });

    return {
        get edges() {
            return edges;
        },
        destroy() {
            scroller.removeEventListener('scroll', update);
            resizeObserver?.disconnect();
            mutationObserver.disconnect();
        }
    };
};
