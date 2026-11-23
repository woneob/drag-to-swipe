import {
    dispatchSnapTarget,
    findNearestSnapIndex,
    getSnapAreas,
    mergeSnapAreas,
    SNAP_TARGET_EVENT,
    SnapArea
} from './snap';

export interface SnapIndexState {
    /** Current snap point index (0-based) */
    index: number;
    /** Number of reachable snap points — smaller than `slideCount` when several slides fit on screen */
    total: number;
    /** Number of snap areas (slides) */
    slideCount: number;
}

export interface SnapIndexObserver {
    readonly state: SnapIndexState;
    /** Smooth-scrolls to the given snap point. */
    scrollToIndex(index: number, behavior?: ScrollBehavior): void;
    /** Re-measures snap points (called automatically on resize / DOM changes). */
    refresh(): void;
    destroy(): void;
}

// settle delay when `scrollend` is unsupported (ms)
const SETTLE_DELAY_MS = 150;
// arrival tolerance (px)
const ARRIVAL_EPSILON = 1;

type SnapChangingEvent = Event & { snapTargetInline?: Element | null };

/**
 * Tracks the current snap point of a horizontal scroller — for pagination / dots.
 * - Not updated while the user is holding (dragging)
 * - Updates to the target index as soon as a move starts
 *   - JS moves (drag release, page buttons, scrollToIndex): on the target event
 *   - native scroll (touch, wheel): `scrollsnapchanging` target, applied on touch release
 *   - fallback: nearest point when scrolling ends (browsers without `scrollsnapchanging`)
 * - Re-measures on resize and child changes
 */
export const observeSnapIndex = (
    element: HTMLElement,
    onChange?: (state: SnapIndexState) => void
): SnapIndexObserver => {
    let state: SnapIndexState = { index: 0, total: 0, slideCount: 0 };
    let areas: SnapArea[] = [];
    let positions: number[] = [];
    // target of an in-flight JS move (ignore settle until arrival)
    let movingTarget: number | null = null;
    // touch / mouse is pressed — no updates while dragging
    let isHolding = false;
    // native snap target received while holding (applied on release)
    let pendingLeft: number | null = null;
    let measureRafId = 0;
    let settleTimer = 0;

    const setState = (next: SnapIndexState) => {
        if (
            next.index === state.index &&
            next.total === state.total &&
            next.slideCount === state.slideCount
        ) {
            return;
        }
        state = next;
        onChange?.(state);
    };

    const setIndexByLeft = (left: number) => {
        setState({ ...state, index: findNearestSnapIndex(positions, left) });
    };

    const measure = () => {
        areas = getSnapAreas(element);
        positions = mergeSnapAreas(areas).map(({ position }) => position);
        const isMoving = isHolding || movingTarget !== null;
        setState({
            index: isMoving ? state.index : findNearestSnapIndex(positions, element.scrollLeft),
            total: positions.length,
            slideCount: areas.length
        });
    };

    // batch consecutive changes into one frame
    const scheduleMeasure = () => {
        cancelAnimationFrame(measureRafId);
        measureRafId = requestAnimationFrame(measure);
    };

    // settle on scroll end — skipped while holding or before a JS move arrives
    const settle = () => {
        if (isHolding) return;
        if (movingTarget !== null) {
            if (Math.abs(element.scrollLeft - movingTarget) > ARRIVAL_EPSILON) return;
            movingTarget = null;
        }
        setIndexByLeft(element.scrollLeft);
    };

    const onSnapTarget = (e: Event) => {
        const { left } = (e as CustomEvent<{ left: number }>).detail;
        movingTarget = left;
        setIndexByLeft(left);
    };

    const onSnapChanging = (e: Event) => {
        const target = (e as SnapChangingEvent).snapTargetInline;
        const area = target && areas.find((snapArea) => snapArea.element === target);
        if (!area) return;
        if (isHolding) {
            pendingLeft = area.position;
            return;
        }
        setIndexByLeft(area.position);
    };

    const onHoldStart = () => {
        isHolding = true;
        pendingLeft = null;
        movingTarget = null;
    };

    const onHoldEnd = () => {
        if (!isHolding) return;
        isHolding = false;
        if (pendingLeft !== null) setIndexByLeft(pendingLeft);
        pendingLeft = null;
    };

    // pointer events only for mouse — touch fires pointercancel as soon as native scrolling starts
    // (while still pressed), so touch uses touch events
    const onPointerHoldStart = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') onHoldStart();
    };
    const onPointerHoldEnd = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') onHoldEnd();
    };

    const hasScrollEnd = 'onscrollend' in window;
    const onScroll = () => {
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(settle, SETTLE_DELAY_MS);
    };

    measure();
    element.addEventListener(SNAP_TARGET_EVENT, onSnapTarget);
    element.addEventListener('scrollsnapchanging', onSnapChanging);
    element.addEventListener('touchstart', onHoldStart, { passive: true });
    element.addEventListener('touchend', onHoldEnd);
    element.addEventListener('touchcancel', onHoldEnd);
    element.addEventListener('pointerdown', onPointerHoldStart);
    window.addEventListener('pointerup', onPointerHoldEnd);
    window.addEventListener('pointercancel', onPointerHoldEnd);
    if (hasScrollEnd) element.addEventListener('scrollend', settle);
    else element.addEventListener('scroll', onScroll, { passive: true });
    const resizeObserver =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(element);
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(element, { childList: true, subtree: true });

    return {
        get state() {
            return state;
        },
        scrollToIndex(index, behavior = 'smooth') {
            const left = positions[index];
            if (left === undefined) return;
            dispatchSnapTarget(element, left);
            element.scrollTo({ left, behavior });
        },
        refresh: measure,
        destroy() {
            cancelAnimationFrame(measureRafId);
            window.clearTimeout(settleTimer);
            element.removeEventListener(SNAP_TARGET_EVENT, onSnapTarget);
            element.removeEventListener('scrollsnapchanging', onSnapChanging);
            element.removeEventListener('touchstart', onHoldStart);
            element.removeEventListener('touchend', onHoldEnd);
            element.removeEventListener('touchcancel', onHoldEnd);
            element.removeEventListener('pointerdown', onPointerHoldStart);
            window.removeEventListener('pointerup', onPointerHoldEnd);
            window.removeEventListener('pointercancel', onPointerHoldEnd);
            element.removeEventListener('scrollend', settle);
            element.removeEventListener('scroll', onScroll);
            resizeObserver?.disconnect();
            mutationObserver.disconnect();
        }
    };
};
