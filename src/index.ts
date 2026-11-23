export {
    createDragToSwipe,
    CLASS_DRAGGING,
    CLASS_OVERSCROLLING,
    OVERSCROLL_VAR
} from './core/dragToSwipe';
export type { DragToSwipeController, DragToSwipeOptions } from './core/dragToSwipe';

export { observeSnapIndex } from './core/snapIndex';
export type { SnapIndexObserver, SnapIndexState } from './core/snapIndex';

export { createPager, getScrollEdges, observeScrollEdges } from './core/pager';
export type { Pager, ScrollEdges, ScrollEdgesObserver } from './core/pager';

export {
    dispatchSnapInterrupt,
    dispatchSnapTarget,
    findNearestSnapIndex,
    getInlineSnapAlign,
    getPageSnapTarget,
    getSnapAreas,
    getSnapPoints,
    getSnapStrictness,
    mergeSnapAreas,
    resolvePageSnapTarget,
    resolveSnapTarget,
    SNAP_INTERRUPT_EVENT,
    SNAP_TARGET_EVENT
} from './core/snap';
export type {
    PageDirection,
    ResolvePageSnapTargetParams,
    ResolveSnapTargetParams,
    SnapArea,
    SnapPoint,
    SnapStrictness
} from './core/snap';
