import {
    dispatchSnapTarget,
    getSnapPoints,
    getSnapStrictness,
    resolveSnapTarget,
    SNAP_INTERRUPT_EVENT,
    SnapStrictness
} from './snap';

export const CLASS_DRAGGING = 'dts-dragging';
export const CLASS_OVERSCROLLING = 'dts-overscrolling';
export const OVERSCROLL_VAR = '--dts-overscroll';

export interface DragToSwipeOptions {
    /** Momentum decay per frame (0–1). Higher glides longer. @default 0.9 */
    decay?: number;
    /** Rubber-band effect when dragging past either edge. @default true */
    overscroll?: boolean;
    /** Pointer travel (px) before a press turns into a drag. @default 5 */
    dragThreshold?: number;
    /** Called once a press turns into a drag. */
    onSwipeStart?: () => void;
    /** Called after a drag is released (after the click that follows it). */
    onSwipeEnd?: () => void;
}

export interface DragToSwipeController {
    /** Whether a mouse drag is in progress. */
    readonly isDragging: boolean;
    /** Stops momentum/snap animation and restores CSS snap. */
    interrupt(): void;
    /** Removes all listeners and restores the element. */
    destroy(): void;
}

// release after resting longer than this (ms) → no momentum
const RELEASE_IDLE_MS = 100;
// momentum loop stops below this velocity (px/frame)
const MOMENTUM_MIN_VELOCITY = 0.5;
// snap animation stops within this distance (px)
const SNAP_STOP_DISTANCE = 0.5;
// external scroll detection tolerance during snap animation (px) — above scrollLeft rounding error
const EXTERNAL_SCROLL_THRESHOLD = 2;
// per-frame decay for alignment without momentum (e.g. returning in place)
const SNAP_SETTLE_DECAY = 0.8;
// overscroll resistance exponent — displayed distance = excess ^ exponent
const OVERSCROLL_RESISTANCE = 0.85;
// per-frame decay of the overscroll return
const OVERSCROLL_RETURN_DECAY = 0.8;

// total distance of the momentum loop (scrollLeft += v, v *= decay)
const getMomentumDistance = (velocity: number, decay: number) => {
    let distance = 0;
    let v = velocity;
    while (Math.abs(v) > MOMENTUM_MIN_VELOCITY) {
        distance += v;
        v *= decay;
    }
    return distance;
};

/**
 * Enables mouse drag scrolling on a horizontal scroll container.
 * - Only `pointerType: 'mouse'` is handled — touch/pen keep native scrolling and CSS snap
 * - Respects the element's CSS `scroll-snap-type` / `scroll-snap-align` / `scroll-snap-stop`
 * - Wheel/trackpad input is left to the browser
 */
export const createDragToSwipe = (
    slider: HTMLElement,
    options: DragToSwipeOptions = {}
): DragToSwipeController => {
    const {
        decay = 0.9,
        overscroll: overscrollEnabled = true,
        dragThreshold = 5,
        onSwipeStart,
        onSwipeEnd
    } = options;

    let isPointerDown = false;
    let isDragging = false;
    let startX = 0;
    // scrollLeft at drag start
    let startScrollLeft = 0;
    let velX = 0;
    // a drag happened — suppresses the click synthesized right after release
    let hasDragged = false;
    let momentumRafId = 0;
    let snapRafId = 0;
    let overscrollRafId = 0;
    let releaseTimer = 0;
    // CSS snap strictness suspended during the drag (null: not suspended)
    let suspendedSnap: SnapStrictness | null = null;
    let prevInlineSnapType = '';
    // last move timestamp (to detect a release after resting)
    let lastMoveTime = 0;
    // displayed overscroll distance (px, positive: content shifted right)
    let overscroll = 0;
    // restore CSS snap after the overscroll return finishes
    let isSnapResumePending = false;

    // overscroll is rendered as a translateX on children — scrollLeft cannot go out of range
    const applyOverscroll = (offset: number) => {
        overscroll = offset;
        if (offset) {
            slider.style.setProperty(OVERSCROLL_VAR, `${offset}px`);
            slider.classList.add(CLASS_OVERSCROLLING);
        } else {
            slider.style.removeProperty(OVERSCROLL_VAR);
            slider.classList.remove(CLASS_OVERSCROLLING);
        }
    };

    const cancelOverscrollReturn = () => {
        cancelAnimationFrame(overscrollRafId);
        overscrollRafId = 0;
    };

    // snap points measured without the overscroll translateX
    const getSnapPointsWithoutOverscroll = () => {
        if (!overscroll) return getSnapPoints(slider);
        slider.classList.remove(CLASS_OVERSCROLLING);
        const points = getSnapPoints(slider);
        slider.classList.add(CLASS_OVERSCROLLING);
        return points;
    };

    const returnOverscroll = () => {
        cancelOverscrollReturn();
        const step = () => {
            const next = overscroll * OVERSCROLL_RETURN_DECAY;
            if (Math.abs(next) > SNAP_STOP_DISTANCE) {
                applyOverscroll(next);
                overscrollRafId = requestAnimationFrame(step);
            } else {
                applyOverscroll(0);
                overscrollRafId = 0;
                if (isSnapResumePending) resumeSnap();
            }
        };
        if (overscroll) overscrollRafId = requestAnimationFrame(step);
    };

    // disable CSS snap while dragging — otherwise the browser re-snaps on every scrollLeft write
    const suspendSnap = () => {
        if (suspendedSnap) return;
        suspendedSnap = getSnapStrictness(getComputedStyle(slider).scrollSnapType);
        if (!suspendedSnap) return;
        prevInlineSnapType = slider.style.scrollSnapType;
        slider.style.scrollSnapType = 'none';
    };

    // deferred until the overscroll return ends — re-snapping against translated children jumps backwards
    const resumeSnap = () => {
        if (!suspendedSnap) return;
        if (overscroll) {
            isSnapResumePending = true;
            return;
        }
        isSnapResumePending = false;
        slider.style.scrollSnapType = prevInlineSnapType;
        suspendedSnap = null;
    };

    const cancelSnapAnimation = () => {
        cancelAnimationFrame(snapRafId);
        snapRafId = 0;
    };

    const cancelMomentum = () => {
        cancelAnimationFrame(momentumRafId);
        momentumRafId = 0;
    };

    const momentumLoop = () => {
        slider.scrollLeft += velX;
        velX *= decay;
        momentumRafId =
            Math.abs(velX) > MOMENTUM_MIN_VELOCITY ? requestAnimationFrame(momentumLoop) : 0;
    };

    // decelerate frame by frame towards the snap point (same feel as momentum), then restore CSS snap
    const animateSnap = (target: number) => {
        dispatchSnapTarget(slider, target);
        const distance = target - slider.scrollLeft;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        // skip writing scrollLeft when no move is needed (plain click)
        if (Math.abs(distance) < 1 || reduceMotion) {
            if (Math.abs(distance) >= 1) slider.scrollLeft = target;
            resumeSnap();
            return;
        }

        // decay that starts at the release velocity and stops at the target — v / (1 - decay) = distance
        // - capped at the momentum decay so a slow release never moves slower than momentum
        // - reverse/zero velocity or velocity larger than the distance → settle decay
        const fitDecay = 1 - velX / distance;
        const snapDecay =
            Math.sign(velX) !== Math.sign(distance) || fitDecay <= 0
                ? SNAP_SETTLE_DECAY
                : Math.min(fitDecay, decay);

        // accumulate position separately — scrollLeft rounding would otherwise loop forever
        let position = slider.scrollLeft;
        const step = () => {
            // abort on external scroll (scrollTo etc.) so it is not overwritten
            if (Math.abs(slider.scrollLeft - position) > EXTERNAL_SCROLL_THRESHOLD) {
                snapRafId = 0;
                resumeSnap();
                return;
            }
            const remaining = target - position;
            if (Math.abs(remaining) > SNAP_STOP_DISTANCE) {
                position += remaining * (1 - snapDecay);
                slider.scrollLeft = position;
                snapRafId = requestAnimationFrame(step);
            } else {
                slider.scrollLeft = target;
                snapRafId = 0;
                resumeSnap();
            }
        };
        snapRafId = requestAnimationFrame(step);
    };

    const endDrag = () => {
        isPointerDown = false;
        slider.classList.remove(CLASS_DRAGGING);
    };

    // release — snap to the point nearest the projected momentum position, or glide with momentum
    const releaseDrag = (time: number) => {
        endDrag();
        returnOverscroll();
        if (isDragging) {
            // keep the drag state until the synthesized click has been handled
            window.clearTimeout(releaseTimer);
            releaseTimer = window.setTimeout(() => {
                isDragging = false;
                hasDragged = false;
                onSwipeEnd?.();
            }, 0);
        }
        if (time - lastMoveTime > RELEASE_IDLE_MS) velX = 0;

        if (suspendedSnap) {
            const current = slider.scrollLeft;
            const target = resolveSnapTarget({
                points: getSnapPointsWithoutOverscroll(),
                current,
                projected: current + getMomentumDistance(velX, decay),
                strictness: suspendedSnap,
                snapportWidth: slider.clientWidth,
                // scroll-snap-stop is evaluated against the drag start
                origin: startScrollLeft
            });
            if (target !== null) {
                animateSnap(target);
                return;
            }
            resumeSnap();
        }

        // momentum only after a real drag — writing scrollLeft on a plain click would cancel
        // a smooth scrollTo() triggered by that click (e.g. centering a tab)
        if (Math.abs(velX) > MOMENTUM_MIN_VELOCITY) {
            cancelMomentum();
            momentumRafId = requestAnimationFrame(momentumLoop);
        }
    };

    const handlePointerDown = (e: PointerEvent) => {
        // decide by input type, not device — only mouse is JS-dragged
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        e.preventDefault();
        isPointerDown = true;
        hasDragged = false;
        startX = e.clientX;
        // drop leftover velocity so a click never restarts momentum
        velX = 0;
        cancelMomentum();
        cancelSnapAnimation();
        cancelOverscrollReturn();
        applyOverscroll(0);
        isSnapResumePending = false;
        suspendSnap();
        startScrollLeft = slider.scrollLeft;
    };

    const handlePointerUp = (e: PointerEvent) => {
        if (!isPointerDown) return;
        e.preventDefault();
        releaseDrag(e.timeStamp);
    };

    const handlePointerCancel = () => {
        if (!isPointerDown) return;
        cancelMomentum();
        // align to the nearest point without momentum
        velX = 0;
        releaseDrag(lastMoveTime);
    };

    const handlePointerMove = (e: PointerEvent) => {
        if (!isPointerDown) return;
        // moving with no button pressed ends the drag
        // - a real mouse fires a buttons=0 move right before pointerup → keep the last velocity
        // - re-entering after releasing outside the window → no momentum (elapsed time)
        if (e.buttons === 0) {
            releaseDrag(e.timeStamp);
            return;
        }
        e.preventDefault();
        const walk = e.clientX - startX;

        if (!hasDragged && Math.abs(walk) > dragThreshold) {
            hasDragged = true;
            slider.classList.add(CLASS_DRAGGING);
            // capture only once dragging — a plain click still reaches the child
            if (!slider.hasPointerCapture(e.pointerId)) slider.setPointerCapture(e.pointerId);
        }

        const prevScrollLeft = slider.scrollLeft;
        const maxScroll = slider.scrollWidth - slider.clientWidth;
        const nextScrollLeft = startScrollLeft - walk;
        const clamped = Math.min(Math.max(nextScrollLeft, 0), maxScroll);
        slider.scrollLeft = clamped;
        velX = slider.scrollLeft - prevScrollLeft;
        // rubber-band the excess past either edge (only when scrollable)
        const excess = clamped - nextScrollLeft;
        if (overscrollEnabled && maxScroll > 0) {
            applyOverscroll(
                excess ? Math.sign(excess) * Math.abs(excess) ** OVERSCROLL_RESISTANCE : 0
            );
        }
        lastMoveTime = e.timeStamp;

        if (hasDragged && !isDragging) {
            window.clearTimeout(releaseTimer);
            isDragging = true;
            onSwipeStart?.();
        }
    };

    // block the click synthesized on a child right after a drag (capture phase)
    const handleClickCapture = (e: MouseEvent) => {
        if (!hasDragged) return;
        e.preventDefault();
        e.stopPropagation();
        hasDragged = false;
    };

    // external move (page buttons etc.) about to start — stop animations, restore CSS snap
    const interrupt = () => {
        if (isPointerDown) return;
        cancelMomentum();
        cancelSnapAnimation();
        cancelOverscrollReturn();
        applyOverscroll(0);
        resumeSnap();
    };

    // wheel/trackpad input is handled by native CSS snap
    const handleWheel = () => {
        cancelMomentum();
        if (isPointerDown) return;
        cancelSnapAnimation();
        resumeSnap();
    };

    // prevent native image/link drag ghosts from hijacking the gesture
    const handleDragStart = (e: DragEvent) => e.preventDefault();

    slider.addEventListener('pointerdown', handlePointerDown);
    slider.addEventListener('pointerup', handlePointerUp);
    slider.addEventListener('pointercancel', handlePointerCancel);
    slider.addEventListener('pointermove', handlePointerMove);
    slider.addEventListener('click', handleClickCapture, true);
    slider.addEventListener('wheel', handleWheel, { passive: true });
    slider.addEventListener('dragstart', handleDragStart);
    slider.addEventListener(SNAP_INTERRUPT_EVENT, interrupt);

    return {
        get isDragging() {
            return isDragging;
        },
        interrupt,
        destroy() {
            slider.removeEventListener('pointerdown', handlePointerDown);
            slider.removeEventListener('pointerup', handlePointerUp);
            slider.removeEventListener('pointercancel', handlePointerCancel);
            slider.removeEventListener('pointermove', handlePointerMove);
            slider.removeEventListener('click', handleClickCapture, true);
            slider.removeEventListener('wheel', handleWheel);
            slider.removeEventListener('dragstart', handleDragStart);
            slider.removeEventListener(SNAP_INTERRUPT_EVENT, interrupt);
            window.clearTimeout(releaseTimer);
            cancelMomentum();
            cancelSnapAnimation();
            cancelOverscrollReturn();
            applyOverscroll(0);
            resumeSnap();
            endDrag();
        }
    };
};
