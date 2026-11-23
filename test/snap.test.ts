import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    findNearestSnapIndex,
    getInlineSnapAlign,
    getSnapPoints,
    getSnapStrictness,
    resolvePageSnapTarget,
    resolveSnapTarget,
    SnapPoint
} from '../src';

describe('getSnapStrictness', () => {
    it('returns strictness when the x axis is snapped', () => {
        expect(getSnapStrictness('x mandatory')).toBe('mandatory');
        expect(getSnapStrictness('both mandatory')).toBe('mandatory');
        expect(getSnapStrictness('inline proximity')).toBe('proximity');
    });

    it('defaults to proximity', () => {
        expect(getSnapStrictness('x')).toBe('proximity');
    });

    it('returns null for none / y only', () => {
        expect(getSnapStrictness('none')).toBeNull();
        expect(getSnapStrictness('y mandatory')).toBeNull();
        expect(getSnapStrictness(undefined)).toBeNull();
    });
});

describe('getInlineSnapAlign', () => {
    it('single value as is, second value of two', () => {
        expect(getInlineSnapAlign('start')).toBe('start');
        expect(getInlineSnapAlign('none center')).toBe('center');
    });

    it('none when unset', () => {
        expect(getInlineSnapAlign('')).toBe('none');
        expect(getInlineSnapAlign(undefined)).toBe('none');
    });
});

describe('resolveSnapTarget', () => {
    const toPoints = (positions: number[], stopAlways: number[] = []): SnapPoint[] =>
        positions.map((position) => ({ position, stopAlways: stopAlways.includes(position) }));
    const points = toPoints([0, 145, 290, 435, 580]);
    const base = { points, strictness: 'mandatory' as const, snapportWidth: 375 };

    it('picks the point nearest the projected position', () => {
        // no momentum: less than half → back, half or more → next
        expect(resolveSnapTarget({ ...base, current: 50, projected: 50 })).toBe(0);
        expect(resolveSnapTarget({ ...base, current: 80, projected: 80 })).toBe(145);
        // strong fling: several steps
        expect(resolveSnapTarget({ ...base, current: 80, projected: 500 })).toBe(435);
    });

    it('never backtracks while flinging', () => {
        expect(resolveSnapTarget({ ...base, current: 200, projected: 230 })).toBe(290);
        expect(resolveSnapTarget({ ...base, current: 200, projected: 170 })).toBe(145);
    });

    it('nearest point without momentum', () => {
        expect(resolveSnapTarget({ ...base, current: 200, projected: 200 })).toBe(145);
    });

    it('clamps out-of-range projections to the edge points', () => {
        expect(resolveSnapTarget({ ...base, current: 500, projected: 2000 })).toBe(580);
        expect(resolveSnapTarget({ ...base, current: 100, projected: -300 })).toBe(0);
    });

    it('does not skip scroll-snap-stop: always points', () => {
        const stopPoints = toPoints([0, 145, 290, 435, 580], [290]);
        expect(
            resolveSnapTarget({ ...base, points: stopPoints, current: 10, projected: 560 })
        ).toBe(290);
        expect(
            resolveSnapTarget({ ...base, points: stopPoints, current: 570, projected: 20 })
        ).toBe(290);
    });

    it('moves one step from the origin when every point is stop: always', () => {
        const allStop = toPoints([0, 145, 290, 435, 580], [0, 145, 290, 435, 580]);
        expect(
            resolveSnapTarget({ ...base, points: allStop, origin: 0, current: 60, projected: 560 })
        ).toBe(145);
        expect(
            resolveSnapTarget({ ...base, points: allStop, origin: 0, current: 232, projected: 232 })
        ).toBe(145);
        expect(
            resolveSnapTarget({ ...base, points: allStop, origin: 290, current: 250, projected: 0 })
        ).toBe(145);
    });

    it('proximity does not snap beyond the threshold', () => {
        const proximity = { ...base, strictness: 'proximity' as const };
        expect(resolveSnapTarget({ ...proximity, current: 0, projected: 140 })).toBe(145);
        expect(
            resolveSnapTarget({
                ...proximity,
                points: toPoints([0, 1000]),
                current: 0,
                projected: 500
            })
        ).toBeNull();
    });

    it('null without points', () => {
        expect(resolveSnapTarget({ ...base, points: [], current: 0, projected: 100 })).toBeNull();
    });
});

describe('resolvePageSnapTarget', () => {
    // 175px item pitch, 1000px viewport, max scroll 1207
    const points = [0, 175, 350, 525, 700, 875, 1050, 1207].map((position) => ({
        position,
        stopAlways: false
    }));
    const base = { points, pageWidth: 1000 };

    it('next: the item cut off at the trailing edge comes first', () => {
        expect(resolvePageSnapTarget({ ...base, current: 0, direction: 'next' })).toBe(875);
        expect(resolvePageSnapTarget({ ...base, current: 875, direction: 'next' })).toBe(1207);
    });

    it('prev: the item before the current first item comes last', () => {
        expect(resolvePageSnapTarget({ ...base, current: 1207, direction: 'prev' })).toBe(350);
        expect(resolvePageSnapTarget({ ...base, current: 875, direction: 'prev' })).toBe(0);
    });

    it('very next point when none fits in one page', () => {
        expect(
            resolvePageSnapTarget({ ...base, current: 0, pageWidth: 100, direction: 'next' })
        ).toBe(175);
    });

    it('null when there is nothing ahead', () => {
        expect(resolvePageSnapTarget({ ...base, current: 1207, direction: 'next' })).toBeNull();
        expect(resolvePageSnapTarget({ ...base, current: 0, direction: 'prev' })).toBeNull();
    });
});

describe('findNearestSnapIndex', () => {
    const positions = [0, 175, 350, 525];

    it('nearest index — past half goes to the next', () => {
        expect(findNearestSnapIndex(positions, 0)).toBe(0);
        expect(findNearestSnapIndex(positions, 80)).toBe(0);
        expect(findNearestSnapIndex(positions, 90)).toBe(1);
        expect(findNearestSnapIndex(positions, 2000)).toBe(3);
    });

    it('0 without positions', () => {
        expect(findNearestSnapIndex([], 100)).toBe(0);
    });
});

describe('getSnapPoints', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const rect = (left: number, width: number) =>
        ({ left, right: left + width, width, top: 0, bottom: 0, height: 0 }) as DOMRect;

    // scroller at x=0, 375px wide; 137px cards, 8px gap, 20px side padding
    const setup = (cardCount: number, scrollLeft = 0) => {
        const scroller = document.createElement('div');
        const cards = Array.from({ length: cardCount }, () => {
            const card = document.createElement('div');
            card.className = 'card';
            scroller.appendChild(card);
            return card;
        });
        const contentWidth = 20 + cardCount * 137 + (cardCount - 1) * 8 + 20;
        Object.defineProperties(scroller, {
            clientWidth: { value: 375 },
            scrollWidth: { value: contentWidth },
            clientLeft: { value: 0 },
            scrollLeft: { value: scrollLeft }
        });
        scroller.getBoundingClientRect = () => rect(0, 375);
        cards.forEach((card, index) => {
            card.getBoundingClientRect = () => rect(20 + index * 145 - scrollLeft, 137);
        });

        const original = window.getComputedStyle;
        vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
            const style = original(el);
            const isCard = (el as Element).classList.contains('card');
            return {
                ...style,
                display: 'block',
                overflowX: 'visible',
                overflowY: 'visible',
                scrollPaddingLeft: 'auto',
                scrollPaddingRight: 'auto',
                scrollSnapAlign: isCard ? 'start' : 'none',
                scrollMarginLeft: isCard ? '20px' : '0px',
                scrollMarginRight: '0px',
                scrollSnapStop: 'normal'
            } as CSSStyleDeclaration;
        });
        return scroller;
    };

    it('applies scroll-margin, clamps to max scroll and merges duplicates', () => {
        // content 1482, max scroll 1107 → cards from the 8th merge at 1107
        const positions = getSnapPoints(setup(10)).map(({ position }) => position);
        expect(positions).toEqual([0, 145, 290, 435, 580, 725, 870, 1015, 1107]);
    });

    it('same coordinates regardless of the current scroll position', () => {
        const positions = getSnapPoints(setup(10, 300)).map(({ position }) => position);
        expect(positions).toEqual([0, 145, 290, 435, 580, 725, 870, 1015, 1107]);
    });
});
