# drag-to-swipe

Mouse drag scrolling for **CSS scroll-snap** carousels — with momentum, snapping and rubber-band overscroll.

On touch devices a horizontal scroller with `scroll-snap-type` already feels like a slider. With a mouse it doesn't: you can't swipe, and hiding the scrollbar leaves no way to scroll at all. `drag-to-swipe` adds a mouse drag gesture that behaves like the native touch one, while **touch and pen keep 100% native scrolling**.

- 🖱 Mouse-only JS drag — decided per input (`pointerType`), not per device
- 🧲 Snaps using **your CSS** (`scroll-snap-type`, `scroll-snap-align`, `scroll-margin`, `scroll-padding`, `scroll-snap-stop`) — no JS snap config
- 🏃 Momentum projection: a flick lands several items ahead, like native
- 🪀 Rubber-band overscroll at both edges
- 🚫 Click suppression after a drag — links and buttons inside stay clickable
- 🔢 Optional helpers: current snap index, page-by-page prev/next, edge detection, dots / fraction indicators
- 📦 Framework-agnostic core + React bindings, zero dependencies, ESM + CJS + types

## Install

```bash
npm i drag-to-swipe
# pnpm add drag-to-swipe / yarn add drag-to-swipe
```

## Usage

### Vanilla

```html
<div class="carousel dts-scroller dts-hide-scrollbar">
    <article class="card">…</article>
    <article class="card">…</article>
</div>
```

```css
.carousel {
    display: flex;
    gap: 12px;
    scroll-snap-type: x mandatory;
}
.card {
    flex: 0 0 160px;
    scroll-snap-align: start;
}
```

```ts
import { createDragToSwipe } from 'drag-to-swipe';
import 'drag-to-swipe/style.css';

const drag = createDragToSwipe(document.querySelector('.carousel')!);
// later
drag.destroy();
```

Snapping is optional — without `scroll-snap-type` (e.g. a tab bar) you get free drag with momentum.

### React

```tsx
import { DragToSwipe } from 'drag-to-swipe/react';
import 'drag-to-swipe/style.css';

<DragToSwipe as="ul" className="carousel">
    {items.map((item) => (
        <li key={item.id} className="card">…</li>
    ))}
</DragToSwipe>;
```

With indicators and prev / next buttons:

```tsx
import {
    DragToSwipe,
    SnapDots,
    SnapFraction,
    useMergedRefs,
    usePager,
    useScrollEdges,
    useSnapIndex
} from 'drag-to-swipe/react';

const Carousel = ({ items }) => {
    const snap = useSnapIndex();
    const edges = useScrollEdges();
    const pager = usePager();
    const ref = useMergedRefs(snap.ref, edges.ref, pager.ref);

    return (
        <>
            <DragToSwipe ref={ref} className="carousel">
                {items.map((item) => <div key={item.id} className="card">…</div>)}
            </DragToSwipe>
            <button onClick={pager.prev} disabled={edges.atStart}>Prev</button>
            <SnapFraction index={snap.index} total={snap.total} />
            <SnapDots index={snap.index} total={snap.total} onSelect={snap.scrollToIndex} />
            <button onClick={pager.next} disabled={edges.atEnd}>Next</button>
        </>
    );
};
```

Prefer your own element? Use the hook:

```tsx
const { ref, isDragging } = useDragToSwipe<HTMLDivElement>({ decay: 0.92 });
return <div ref={ref} className="carousel dts-scroller">…</div>;
```

## API

### Core — `drag-to-swipe`

#### `createDragToSwipe(element, options?) → DragToSwipeController`

| Option              | Type         | Default | Description                                             |
| ------------------- | ------------ | ------- | ------------------------------------------------------- |
| `decay`             | `number`     | `0.9`   | Momentum decay per frame (0–1). Higher glides longer.   |
| `overscroll`        | `boolean`    | `true`  | Rubber-band effect past either edge.                    |
| `dragThreshold`     | `number`     | `5`     | Pointer travel (px) before a press becomes a drag.      |
| `onSwipeStart` | `() => void` |         | A press turned into a drag.                             |
| `onSwipeEnd`   | `() => void` |         | Drag released (fires after the suppressed click).       |

Controller: `isDragging`, `interrupt()` (stop momentum / snap animation), `destroy()`.

#### `observeSnapIndex(element, onChange?) → SnapIndexObserver`

Tracks `{ index, total, slideCount }`.
`total` is the number of reachable snap points (smaller than `slideCount` when several slides fit in view).
The index is held while the user is dragging and jumps to the target as soon as a move starts (drag release, pager, `scrollToIndex`, native `scrollsnapchanging`), then settles on `scrollend`.

Methods: `state`, `scrollToIndex(index, behavior?)`, `refresh()`, `destroy()`.

#### `createPager(element) → { prev, next, destroy }`

Page-by-page navigation. With snap, the item cut off at the edge becomes the first item of the next page (moving by `clientWidth` would let the browser re-snap and skip it). Repeated clicks in the same direction are ignored while moving.

#### `observeScrollEdges(element, onChange?)` / `getScrollEdges(element)`

`{ atStart, atEnd }` — for disabling buttons or edge fades.

#### Snap utilities

`getSnapPoints`, `getSnapAreas`, `resolveSnapTarget`, `resolvePageSnapTarget`, `getPageSnapTarget`, `findNearestSnapIndex`, `getSnapStrictness`, `getInlineSnapAlign` — the pure functions used internally, exported for custom UIs.

#### Events

| Event                                         | Fired when                                                    |
| --------------------------------------------- | ------------------------------------------------------------- |
| `SNAP_TARGET_EVENT` (`snapdragscroll:target`) | A JS-driven move picked its target — `detail.left`            |
| `SNAP_INTERRUPT_EVENT`                        | Dispatch it (`dispatchSnapInterrupt`) before your own `scrollTo` to stop an ongoing glide |

### React — `drag-to-swipe/react`

| Export                   | Description                                                            |
| ------------------------ | ---------------------------------------------------------------------- |
| `<DragToSwipe>`           | `as`, `hideScrollbar` (default `true`), `disabled`, all drag options, any HTML attribute. Forwards `ref`. |
| `useDragToSwipe(options)` | `{ ref, isDragging }`; accepts `disabled`                              |
| `useSnapIndex()`         | `{ ref, index, total, slideCount, scrollToIndex }`                     |
| `useScrollEdges()`       | `{ ref, atStart, atEnd }`                                              |
| `usePager()`             | `{ ref, prev, next }`                                                  |
| `useMergedRefs(...refs)` | Stable merged callback ref                                             |
| `<SnapDots>`             | `index`, `total`, `onSelect?` (buttons when set), `getLabel?`          |
| `<SnapFraction>`         | `index`, `total`                                                       |

## Styling

`drag-to-swipe/style.css` is optional but recommended.

| Class / variable          | Purpose                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `.dts-scroller`           | `overflow-x: auto`                                                        |
| `.dts-hide-scrollbar`     | Hides the native scrollbar                                                |
| `.dts-disabled`           | No horizontal scroll, vertical page scroll still works on touch           |
| `.dts-dragging`           | Added while dragging — grabbing cursor, `pointer-events: none` on children |
| `.dts-overscrolling`      | Added while rubber-banding — children get `translateX(var(--dts-overscroll))` |
| `--dts-dot-*`, `--dts-fraction-*` | Indicator colors / sizes                                          |

If you skip the stylesheet, at least add the `.dts-overscrolling > *` rule (or pass `overscroll: false`).

## How it works

1. `pointerdown` with a mouse suspends CSS snap (inline `scroll-snap-type: none`) so writing `scrollLeft` doesn't re-snap every frame.
2. `pointermove` writes `scrollLeft` directly; excess past the edges is rendered as a dampened `translateX`.
3. On release the momentum end position is projected and the nearest snap point is resolved from computed CSS — honoring `scroll-snap-stop: always` and never backtracking against the fling.
4. The scroller decelerates to that point frame by frame, then the original `scroll-snap-type` is restored.

Touch, pen and wheel/trackpad input are left entirely to the browser.

## Browser support

Modern evergreen browsers (Pointer Events, CSS Scroll Snap). `scrollend` / `scrollsnapchanging` are used when available, with fallbacks.

## Development

```bash
pnpm install
pnpm dev        # demo at http://localhost:5173
pnpm test
pnpm typecheck
pnpm build
```

## License

MIT
