import '../src/style.css';
import { createDragToSwipe, createPager, observeScrollEdges, observeSnapIndex } from '../src';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hue = (i: number) => `hsl(${(i * 37) % 360} 70% 55%)`;

const fillCards = (scroller: HTMLElement, count: number) => {
    for (let i = 0; i < count; i++) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'card';
        card.style.background = hue(i);
        card.textContent = String(i + 1);
        card.addEventListener('click', () => {
            $('log').textContent = `Clicked card ${i + 1}`;
        });
        scroller.appendChild(card);
    }
};

// product carousel
const carousel = $('carousel');
fillCards(carousel, 14);
createDragToSwipe(carousel, {
    onSwipeStart: () => ($('log').textContent = 'Dragging…'),
    onSwipeEnd: () => ($('log').textContent = 'Released')
});

const pager = createPager(carousel);
$('prev').addEventListener('click', pager.prev);
$('next').addEventListener('click', pager.next);

observeScrollEdges(carousel, ({ atStart, atEnd }) => {
    $<HTMLButtonElement>('prev').disabled = atStart;
    $<HTMLButtonElement>('next').disabled = atEnd;
});
$<HTMLButtonElement>('prev').disabled = true;

const renderIndicators = ({ index, total }: { index: number; total: number }) => {
    const current = document.createElement('strong');
    current.className = 'dts-fraction-current';
    current.textContent = String(index + 1);
    $('fraction').replaceChildren(current, ` / ${total}`);

    const dots = $('dots');
    dots.replaceChildren(
        ...Array.from({ length: total }, (_, i) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = i === index ? 'dts-dot is-active' : 'dts-dot';
            dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
            dot.addEventListener('click', () => snapIndex.scrollToIndex(i));
            return dot;
        })
    );
};
const snapIndex = observeSnapIndex(carousel, renderIndicators);
renderIndicators(snapIndex.state);

// full-width slides
const wide = $('wide');
fillCards(wide, 5);
createDragToSwipe(wide);

// tabs without snap
const tabs = $('tabs');
const labels = ['Home', 'Fresh', 'Bakery', 'Dairy', 'Frozen', 'Snacks', 'Drinks', 'Household'];
[...labels, ...labels.map((label) => `${label} 2`)].forEach((label) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.textContent = label;
    tab.addEventListener('click', () => {
        tabs.querySelector('.is-active')?.classList.remove('is-active');
        tab.classList.add('is-active');
        tabs.scrollTo({
            left: tab.offsetLeft - tabs.clientWidth / 2 + tab.clientWidth / 2,
            behavior: 'smooth'
        });
    });
    tabs.appendChild(tab);
});
createDragToSwipe(tabs);
