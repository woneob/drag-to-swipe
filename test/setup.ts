// jsdom lacks PointerEvent — needed to pass pointerType / pointerId
if (!window.PointerEvent) {
    class PointerEventPolyfill extends MouseEvent {
        pointerType: string;
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerType = init.pointerType ?? '';
            this.pointerId = init.pointerId ?? 1;
        }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}
