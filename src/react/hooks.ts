import { MutableRefObject, Ref, RefCallback, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDragToSwipe, DragToSwipeOptions } from '../core/dragToSwipe';
import { createPager, getScrollEdges, observeScrollEdges, ScrollEdges } from '../core/pager';
import { observeSnapIndex, SnapIndexObserver, SnapIndexState } from '../core/snapIndex';

type ElementRef<T extends HTMLElement> = RefCallback<T>;

// callback ref backed by state — effects re-run when the node mounts / changes
const useElementRef = <T extends HTMLElement>(): [T | null, ElementRef<T>] => {
    const [element, setElement] = useState<T | null>(null);
    const ref = useCallback((node: T | null) => setElement(node), []);
    return [element, ref];
};

// latest value without re-running effects (callbacks)
const useLatest = <T>(value: T) => {
    const ref = useRef(value);
    useEffect(() => {
        ref.current = value;
    });
    return ref;
};

/** Combines several refs into one callback ref. */
export const mergeRefs =
    <T>(...refs: Array<Ref<T> | undefined | null>): RefCallback<T> =>
    (node) => {
        refs.forEach((ref) => {
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as MutableRefObject<T | null>).current = node;
        });
    };

/** Memoized `mergeRefs` — keeps a stable ref identity across renders. */
export const useMergedRefs = <T>(...refs: Array<Ref<T> | undefined | null>) =>
    useMemo(() => mergeRefs(...refs), refs);

export interface UseDragToSwipeOptions extends DragToSwipeOptions {
    /** Turns mouse dragging off (e.g. in an editor). */
    disabled?: boolean;
}

/** Mouse drag scrolling for the element the returned `ref` is attached to. */
export const useDragToSwipe = <T extends HTMLElement = HTMLElement>(
    options: UseDragToSwipeOptions = {}
) => {
    const { disabled = false, decay, overscroll, dragThreshold } = options;
    const [element, ref] = useElementRef<T>();
    const [isDragging, setIsDragging] = useState(false);
    const callbacks = useLatest(options);

    useEffect(() => {
        if (!element || disabled) return;
        const controller = createDragToSwipe(element, {
            decay,
            overscroll,
            dragThreshold,
            onSwipeStart: () => {
                setIsDragging(true);
                callbacks.current.onSwipeStart?.();
            },
            onSwipeEnd: () => {
                setIsDragging(false);
                callbacks.current.onSwipeEnd?.();
            }
        });
        return () => {
            controller.destroy();
            setIsDragging(false);
        };
    }, [element, disabled, decay, overscroll, dragThreshold, callbacks]);

    return { ref, isDragging };
};

const initialSnapIndex: SnapIndexState = { index: 0, total: 0, slideCount: 0 };

/** Current snap point of the scroller — for pagination and dots. */
export const useSnapIndex = <T extends HTMLElement = HTMLElement>() => {
    const [element, ref] = useElementRef<T>();
    const [state, setState] = useState<SnapIndexState>(initialSnapIndex);
    const observerRef = useRef<SnapIndexObserver | null>(null);

    useEffect(() => {
        if (!element) return;
        const observer = observeSnapIndex(element, setState);
        observerRef.current = observer;
        setState(observer.state);
        return () => {
            observer.destroy();
            observerRef.current = null;
        };
    }, [element]);

    const scrollToIndex = useCallback((index: number, behavior?: ScrollBehavior) => {
        observerRef.current?.scrollToIndex(index, behavior);
    }, []);

    return { ref, ...state, scrollToIndex };
};

/** Whether the scroller is at its start / end. */
export const useScrollEdges = <T extends HTMLElement = HTMLElement>() => {
    const [element, ref] = useElementRef<T>();
    const [edges, setEdges] = useState<ScrollEdges>({ atStart: true, atEnd: true });

    useEffect(() => {
        if (!element) return;
        setEdges(getScrollEdges(element));
        const observer = observeScrollEdges(element, setEdges);
        return () => observer.destroy();
    }, [element]);

    return { ref, ...edges };
};

/** Page-by-page `prev` / `next` for buttons. */
export const usePager = <T extends HTMLElement = HTMLElement>() => {
    const [element, ref] = useElementRef<T>();
    const pagerRef = useRef<ReturnType<typeof createPager> | null>(null);

    useEffect(() => {
        if (!element) return;
        const pager = createPager(element);
        pagerRef.current = pager;
        return () => {
            pager.destroy();
            pagerRef.current = null;
        };
    }, [element]);

    const prev = useCallback(() => pagerRef.current?.prev(), []);
    const next = useCallback(() => pagerRef.current?.next(), []);

    return { ref, prev, next };
};
