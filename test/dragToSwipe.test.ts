import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import {
    CLASS_DRAGGING,
    createDragToSwipe,
    DragToSwipeController,
    SNAP_TARGET_EVENT
} from '../src';

let rafQueue: FrameRequestCallback[] = [];
let controller: DragToSwipeController | null = null;

const flushFrames = (count: number) => {
    for (let i = 0; i < count; i++) {
        const queue = rafQueue;
        rafQueue = [];
        queue.forEach((cb) => cb(0));
    }
};

const ITEM_WIDTH = 100;

/**
 * 300px viewport, 1000px content (max scroll 700).
 * `snapType` is the scroller's CSS scroll-snap-type; with `snapItems` each child snaps at start.
 */
const setup = ({ snapType = 'none', snapItems = false } = {}) => {
    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) =>
        ({
            ...originalGetComputedStyle(el),
            display: 'block',
            overflowX: 'visible',
            overflowY: 'visible',
            scrollSnapAlign: snapItems && el.classList.contains('item') ? 'start' : 'none',
            scrollSnapStop: 'normal',
            scrollSnapType: el.classList.contains('scroller')
                ? (el as HTMLElement).style.scrollSnapType || snapType
                : 'none',
            scrollMarginLeft: '0px',
            scrollMarginRight: '0px',
            scrollPaddingLeft: '0px',
            scrollPaddingRight: '0px'
        })
    );

    const scroller = document.createElement('div');
    scroller.className = 'scroller';
    for (let i = 0; i < 10; i++) {
        const item = document.createElement('button');
        item.className = 'item';
        scroller.appendChild(item);
    }
    document.body.appendChild(scroller);

    let scrollLeft = 0;
    Object.defineProperties(scroller, {
        scrollWidth: { value: 1000, configurable: true },
        clientWidth: { value: 300, configurable: true },
        scrollLeft: {
            get: () => scrollLeft,
            set: (value: number) => {
                scrollLeft = Math.min(Math.max(value, 0), 700);
            },
            configurable: true
        }
    });
    scroller.getBoundingClientRect = () => ({ left: 0, right: 300 }) as DOMRect;
    Array.from(scroller.children).forEach((child, i) => {
        child.getBoundingClientRect = () =>
            ({
                left: i * ITEM_WIDTH - scrollLeft,
                right: (i + 1) * ITEM_WIDTH - scrollLeft
            }) as DOMRect;
    });
    scroller.setPointerCapture = vi.fn();
    scroller.hasPointerCapture = vi.fn(() => false);
    const onSnapTarget = vi.fn();
    scroller.addEventListener(SNAP_TARGET_EVENT, onSnapTarget);
    const item = scroller.children[0] as HTMLElement;
    return { scroller, item, onSnapTarget };
};

// drag left by `distance` in 3 moves; returns the inline snap type seen while dragging
const drag = (el: HTMLElement, distance = 100) => {
    fireEvent.pointerDown(el, { pointerType: 'mouse', clientX: 300, buttons: 1 });
    [0.2, 0.5, 1].forEach((ratio) =>
        fireEvent.pointerMove(el, {
            pointerType: 'mouse',
            clientX: 300 - distance * ratio,
            buttons: 1
        })
    );
    const draggingSnapType = el.style.scrollSnapType;
    fireEvent.pointerUp(el, { pointerType: 'mouse', clientX: 300 - distance });
    return draggingSnapType;
};

beforeEach(() => {
    rafQueue = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafQueue.push(cb);
        return rafQueue.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList);
});

afterEach(() => {
    controller?.destroy();
    controller = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('createDragToSwipe without snap targets (tabs, navigation)', () => {
    it.each(['x mandatory', 'none'])(
        'plain click keeps position and inline snap, reaches the child (scroll-snap-type: %s)',
        (snapType) => {
            const { scroller, item, onSnapTarget } = setup({ snapType });
            controller = createDragToSwipe(scroller);
            const onClick = vi.fn();
            item.addEventListener('click', onClick);

            fireEvent.pointerDown(item, { pointerType: 'mouse', clientX: 100, buttons: 1 });
            fireEvent.pointerUp(item, { pointerType: 'mouse', clientX: 100 });
            fireEvent.click(item);
            flushFrames(5);

            expect(scroller.scrollLeft).toBe(0);
            expect(scroller.style.scrollSnapType).toBe('');
            expect(onClick).toHaveBeenCalledTimes(1);
            expect(onSnapTarget).not.toHaveBeenCalled();
        }
    );

    it.each([
        ['x mandatory', 'none'],
        ['none', '']
    ])(
        'drag glides with momentum, restores inline snap, blocks the click (scroll-snap-type: %s)',
        (snapType, draggingSnapType) => {
            const { scroller, item, onSnapTarget } = setup({ snapType });
            controller = createDragToSwipe(scroller);
            const onClick = vi.fn();
            item.addEventListener('click', onClick);

            // snap is suspended only when declared
            expect(drag(scroller)).toBe(draggingSnapType);
            expect(scroller.style.scrollSnapType).toBe('');
            const releasedAt = scroller.scrollLeft;
            flushFrames(5);

            expect(scroller.scrollLeft).toBeGreaterThan(releasedAt);
            expect(onSnapTarget).not.toHaveBeenCalled();
            fireEvent.click(item);
            expect(onClick).not.toHaveBeenCalled();
        }
    );
});

describe('createDragToSwipe with snap targets', () => {
    it('snaps to the point nearest the projected position and restores CSS snap', () => {
        const { scroller, onSnapTarget } = setup({ snapType: 'x mandatory', snapItems: true });
        controller = createDragToSwipe(scroller);

        drag(scroller, 130);
        flushFrames(60);

        const target = onSnapTarget.mock.calls[0][0].detail.left;
        expect(target % ITEM_WIDTH).toBe(0);
        expect(target).toBeGreaterThan(100);
        expect(scroller.scrollLeft).toBe(target);
        expect(scroller.style.scrollSnapType).toBe('');
    });
});

describe('createDragToSwipe input handling', () => {
    it('touch keeps the default behavior', () => {
        const { scroller } = setup({ snapType: 'x mandatory' });
        controller = createDragToSwipe(scroller);
        const isNotPrevented = fireEvent.pointerDown(scroller, {
            pointerType: 'touch',
            clientX: 300,
            buttons: 1
        });
        fireEvent.pointerMove(scroller, { pointerType: 'touch', clientX: 100, buttons: 1 });

        expect(isNotPrevented).toBe(true);
        expect(scroller.classList.contains(CLASS_DRAGGING)).toBe(false);
        expect(scroller.scrollLeft).toBe(0);
    });

    it('rubber-bands past the start edge and returns', () => {
        const { scroller } = setup();
        controller = createDragToSwipe(scroller);
        fireEvent.pointerDown(scroller, { pointerType: 'mouse', clientX: 100, buttons: 1 });
        fireEvent.pointerMove(scroller, { pointerType: 'mouse', clientX: 200, buttons: 1 });

        expect(parseFloat(scroller.style.getPropertyValue('--dts-overscroll'))).toBeGreaterThan(0);
        fireEvent.pointerUp(scroller, { pointerType: 'mouse', clientX: 200 });
        flushFrames(60);
        expect(scroller.style.getPropertyValue('--dts-overscroll')).toBe('');
    });

    it('overscroll: false disables rubber-banding', () => {
        const { scroller } = setup();
        controller = createDragToSwipe(scroller, { overscroll: false });
        fireEvent.pointerDown(scroller, { pointerType: 'mouse', clientX: 100, buttons: 1 });
        fireEvent.pointerMove(scroller, { pointerType: 'mouse', clientX: 200, buttons: 1 });

        expect(scroller.style.getPropertyValue('--dts-overscroll')).toBe('');
    });

    it('reports drag start / end', async () => {
        const { scroller } = setup();
        const onSwipeStart = vi.fn();
        const onSwipeEnd = vi.fn();
        controller = createDragToSwipe(scroller, { onSwipeStart, onSwipeEnd });

        drag(scroller);
        expect(onSwipeStart).toHaveBeenCalledTimes(1);
        expect(controller.isDragging).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onSwipeEnd).toHaveBeenCalledTimes(1);
        expect(controller.isDragging).toBe(false);
    });

    it('destroy removes listeners', () => {
        const { scroller } = setup();
        controller = createDragToSwipe(scroller);
        controller.destroy();
        controller = null;

        fireEvent.pointerDown(scroller, { pointerType: 'mouse', clientX: 300, buttons: 1 });
        fireEvent.pointerMove(scroller, { pointerType: 'mouse', clientX: 100, buttons: 1 });
        expect(scroller.scrollLeft).toBe(0);
    });
});
