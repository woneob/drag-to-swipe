import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { observeSnapIndex, SnapIndexObserver } from '../src';

const SLIDE_WIDTH = 100;
const SLIDE_COUNT = 3;

let scroller: HTMLElement;
let observer: SnapIndexObserver;

// 100px slides in a 100px snapport (snap points 0 / 100 / 200)
beforeEach(() => {
    vi.useFakeTimers();
    const originalGetComputedStyle = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) =>
        ({
            ...originalGetComputedStyle(el),
            display: 'block',
            overflowX: 'visible',
            overflowY: 'visible',
            scrollSnapAlign: el.classList.contains('slide') ? 'start' : 'none',
            scrollSnapStop: 'normal',
            scrollMarginLeft: '0px',
            scrollMarginRight: '0px',
            scrollPaddingLeft: '0px',
            scrollPaddingRight: '0px'
        })
    );

    scroller = document.createElement('div');
    let scrollLeft = 0;
    Object.defineProperties(scroller, {
        clientWidth: { value: SLIDE_WIDTH, configurable: true },
        scrollWidth: { value: SLIDE_WIDTH * SLIDE_COUNT, configurable: true },
        scrollLeft: {
            get: () => scrollLeft,
            set: (value: number) => {
                scrollLeft = value;
            },
            configurable: true
        }
    });
    scroller.scrollTo = vi.fn();
    for (let i = 0; i < SLIDE_COUNT; i++) {
        const slide = document.createElement('div');
        slide.className = 'slide';
        slide.getBoundingClientRect = () =>
            ({
                left: i * SLIDE_WIDTH - scroller.scrollLeft,
                right: (i + 1) * SLIDE_WIDTH - scroller.scrollLeft
            }) as DOMRect;
        scroller.appendChild(slide);
    }
    document.body.appendChild(scroller);
});

afterEach(() => {
    observer?.destroy();
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// scroll and settle (falls back to a timer without scrollend)
const scrollTo = (left: number) => {
    scroller.scrollLeft = left;
    fireEvent.scroll(scroller);
    scroller.dispatchEvent(new Event('scrollend'));
    vi.advanceTimersByTime(200);
};

describe('observeSnapIndex', () => {
    it('measures snap points and updates on scroll end', () => {
        const onChange = vi.fn();
        observer = observeSnapIndex(scroller, onChange);
        expect(observer.state).toEqual({ index: 0, total: 3, slideCount: 3 });

        scrollTo(100);
        expect(observer.state.index).toBe(1);
        expect(onChange).toHaveBeenLastCalledWith({ index: 1, total: 3, slideCount: 3 });
    });

    it('scrollToIndex updates immediately to the target', () => {
        observer = observeSnapIndex(scroller);
        observer.scrollToIndex(2);
        expect(observer.state.index).toBe(2);
        expect(scroller.scrollTo).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' });
    });

    it('mouse pointercancel releases the hold', () => {
        observer = observeSnapIndex(scroller);
        fireEvent.pointerDown(scroller, { pointerType: 'mouse' });
        fireEvent.pointerCancel(window, { pointerType: 'mouse' });
        scrollTo(200);
        expect(observer.state.index).toBe(2);
    });

    it('touch pointercancel keeps the hold until the finger lifts', () => {
        observer = observeSnapIndex(scroller);
        fireEvent.touchStart(scroller);
        fireEvent.pointerDown(scroller, { pointerType: 'touch' });
        // native scrolling fires pointercancel while still pressed
        fireEvent.pointerCancel(window, { pointerType: 'touch' });
        scrollTo(200);
        expect(observer.state.index).toBe(0);
        fireEvent.touchEnd(scroller);
        scrollTo(200);
        expect(observer.state.index).toBe(2);
    });
});
