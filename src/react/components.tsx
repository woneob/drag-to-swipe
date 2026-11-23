import { ElementType, forwardRef, HTMLAttributes } from 'react';
import { useDragToSwipe, useMergedRefs, UseDragToSwipeOptions } from './hooks';

const cx = (...names: Array<string | false | null | undefined>) =>
    names.filter(Boolean).join(' ');

export interface DragToSwipeProps extends HTMLAttributes<HTMLElement>, UseDragToSwipeOptions {
    /** Rendered element. @default 'div' */
    as?: ElementType;
    /** Hides the native scrollbar. @default true */
    hideScrollbar?: boolean;
}

/**
 * Horizontal scroller with mouse drag support.
 * Snap behavior comes from your CSS (`scroll-snap-type` on this element, `scroll-snap-align` on items).
 */
export const DragToSwipe = forwardRef<HTMLElement, DragToSwipeProps>(function DragToSwipe(
    {
        as: Tag = 'div',
        className,
        hideScrollbar = true,
        disabled,
        decay,
        overscroll,
        dragThreshold,
        onSwipeStart,
        onSwipeEnd,
        ...rest
    },
    forwardedRef
) {
    const { ref } = useDragToSwipe({
        disabled,
        decay,
        overscroll,
        dragThreshold,
        onSwipeStart,
        onSwipeEnd
    });
    const mergedRef = useMergedRefs(ref, forwardedRef);

    return (
        <Tag
            ref={mergedRef}
            className={cx(
                'dts-scroller',
                hideScrollbar && 'dts-hide-scrollbar',
                disabled && 'dts-disabled',
                className
            )}
            {...rest}
        />
    );
});

export interface SnapDotsProps {
    /** Current index (0-based) */
    index: number;
    /** Number of dots — use `total` (reachable snap points) */
    total: number;
    /** Makes dots clickable buttons (otherwise display-only progress) */
    onSelect?: (index: number) => void;
    /** Accessible label of each dot button */
    getLabel?: (index: number, total: number) => string;
    className?: string;
}

/** Dot navigation / progress. Style via `.dts-dots` CSS variables or `className`. */
export const SnapDots = ({
    index,
    total,
    onSelect,
    getLabel = (dotIndex) => `Go to slide ${dotIndex + 1}`,
    className
}: SnapDotsProps) => {
    if (total <= 1) return null;

    return (
        <div className={cx('dts-dots', className)}>
            {Array.from({ length: total }, (_, dotIndex) => {
                const isActive = dotIndex === index;
                const dotClassName = cx('dts-dot', isActive && 'is-active');
                return onSelect ? (
                    <button
                        key={dotIndex}
                        type="button"
                        className={dotClassName}
                        aria-label={getLabel(dotIndex, total)}
                        aria-current={isActive || undefined}
                        onClick={() => onSelect(dotIndex)}
                    />
                ) : (
                    <span key={dotIndex} className={dotClassName} aria-hidden />
                );
            })}
        </div>
    );
};

export interface SnapFractionProps {
    /** Current index (0-based) */
    index: number;
    /** Denominator — `slideCount` or `total` */
    total: number;
    className?: string;
}

/** `{current}/{total}` page indicator. */
export const SnapFraction = ({ index, total, className }: SnapFractionProps) => {
    if (total <= 0) return null;

    return (
        <div className={cx('dts-fraction', className)}>
            <strong className="dts-fraction-current">{Math.min(index + 1, total)}</strong>
            <span className="dts-fraction-separator">/</span>
            <span className="dts-fraction-total">{total}</span>
        </div>
    );
};
