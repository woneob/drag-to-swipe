import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { DragToSwipe, SnapDots, SnapFraction } from '../src/react';

afterEach(() => {
    vi.restoreAllMocks();
});

const renderScroll = (disabled?: boolean) => {
    const ref = createRef<HTMLElement>();
    const { container } = render(
        <DragToSwipe ref={ref} as="ul" className="custom" disabled={disabled}>
            <li>1</li>
            <li>2</li>
        </DragToSwipe>
    );
    const scroller = container.querySelector('.dts-scroller') as HTMLElement;
    Object.defineProperties(scroller, {
        scrollWidth: { value: 1000, configurable: true },
        clientWidth: { value: 300, configurable: true }
    });
    scroller.setPointerCapture = vi.fn();
    scroller.hasPointerCapture = vi.fn(() => false);
    return { scroller, ref };
};

const dragByMouse = (el: HTMLElement) => {
    fireEvent.pointerDown(el, { pointerType: 'mouse', clientX: 200, buttons: 1 });
    fireEvent.pointerMove(el, { pointerType: 'mouse', clientX: 100, buttons: 1 });
};

describe('DragToSwipe', () => {
    it('renders the given tag with classes and forwards the ref', () => {
        const { scroller, ref } = renderScroll();
        expect(scroller.tagName).toBe('UL');
        expect(scroller.className).toBe('dts-scroller dts-hide-scrollbar custom');
        expect(ref.current).toBe(scroller);
    });

    it('drags with the mouse', () => {
        const { scroller } = renderScroll();
        dragByMouse(scroller);
        expect(scroller.classList.contains('dts-dragging')).toBe(true);
    });

    it('disabled: adds the class and ignores mouse drags', () => {
        const { scroller } = renderScroll(true);
        dragByMouse(scroller);
        expect(scroller.classList.contains('dts-disabled')).toBe(true);
        expect(scroller.classList.contains('dts-dragging')).toBe(false);
    });
});

describe('SnapFraction', () => {
    it('shows current / total (index is 0-based)', () => {
        const { container } = render(<SnapFraction index={2} total={20} />);
        expect(container.querySelector('.dts-fraction-current')?.textContent).toBe('3');
        expect(container.querySelector('.dts-fraction')?.textContent).toBe('3/20');
    });

    it('renders nothing when total is 0', () => {
        const { container } = render(<SnapFraction index={0} total={0} />);
        expect(container.firstChild).toBeNull();
    });
});

describe('SnapDots', () => {
    it('renders dots and highlights the current one', () => {
        const { container } = render(<SnapDots index={1} total={4} />);
        const dots = container.querySelectorAll('.dts-dot');
        expect(dots).toHaveLength(4);
        expect(dots[1].classList.contains('is-active')).toBe(true);
        expect(container.querySelector('button')).toBeNull();
    });

    it('becomes buttons with onSelect', () => {
        const onSelect = vi.fn();
        const { getAllByRole } = render(<SnapDots index={0} total={3} onSelect={onSelect} />);
        const buttons = getAllByRole('button');
        expect(buttons[0].getAttribute('aria-current')).toBe('true');
        expect(buttons[2].getAttribute('aria-label')).toBe('Go to slide 3');
        fireEvent.click(buttons[2]);
        expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('renders nothing for a single dot', () => {
        const { container } = render(<SnapDots index={0} total={1} />);
        expect(container.firstChild).toBeNull();
    });
});
