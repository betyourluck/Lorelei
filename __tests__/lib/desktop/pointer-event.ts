// jsdom は PointerEvent を持たず、fireEvent.pointer* の clientX / pointerId が落ちる。
// つまみ (spec 05 D1) のテストのために MouseEvent を土台にした最小のものを置く
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  (window as unknown as Record<string, unknown>).PointerEvent = PointerEventPolyfill;
}

export {};
