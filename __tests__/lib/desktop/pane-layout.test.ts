import { describe, expect, it } from "vitest";
import {
  LAYOUT_KEY,
  LIST_WIDTH,
  clampListWidth,
  loadLayout,
  saveLayout,
} from "@/lib/desktop/pane-layout";

/** localStorage の代わり。throw させて「書けない」も試す */
const memory = (init: Record<string, string> = {}, broken = false) => {
  const data = { ...init };
  return {
    data,
    getItem: (k: string) => {
      if (broken) throw new Error("denied");
      return data[k] ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error("denied");
      data[k] = v;
    },
  };
};

describe("左ペインの幅 (spec 05 D2、data_contract DesktopLayout)", () => {
  it("既定 240px・下限 180px・上限 480px", () => {
    expect(LIST_WIDTH).toEqual({ initial: 240, min: 180, max: 480 });
    expect(clampListWidth(100, 1600)).toBe(180);
    expect(clampListWidth(900, 1600)).toBe(480);
    expect(clampListWidth(300.4, 1600)).toBe(300);
  });

  it("窓の幅の半分を超えない。窓が狭くても下限は守る", () => {
    expect(clampListWidth(480, 700)).toBe(350);
    expect(clampListWidth(480, 300)).toBe(180);
  });
});

describe("幅と開閉を覚える (spec 05 D3、localStorage lorelei.layout.v1)", () => {
  it("何も無ければ既定値", () => {
    expect(loadLayout(memory())).toEqual({ listWidth: 240, listOpen: true });
  });

  it("保存した値を読み直す", () => {
    const s = memory();
    saveLayout(s, { listWidth: 320, listOpen: false });
    expect(JSON.parse(s.data[LAYOUT_KEY])).toEqual({ listWidth: 320, listOpen: false });
    expect(loadLayout(s)).toEqual({ listWidth: 320, listOpen: false });
  });

  it("壊れた値・型の違う値は既定値、範囲外は範囲の端へ", () => {
    expect(loadLayout(memory({ [LAYOUT_KEY]: "{not json" }))).toEqual({ listWidth: 240, listOpen: true });
    expect(loadLayout(memory({ [LAYOUT_KEY]: '{"listWidth":"wide","listOpen":"no"}' }))).toEqual({
      listWidth: 240,
      listOpen: true,
    });
    expect(loadLayout(memory({ [LAYOUT_KEY]: '{"listWidth":9999,"listOpen":false}' }))).toEqual({
      listWidth: 480,
      listOpen: false,
    });
  });

  it("読めない・書けない localStorage でも止まらない", () => {
    const s = memory({}, true);
    expect(loadLayout(s)).toEqual({ listWidth: 240, listOpen: true });
    expect(() => saveLayout(s, { listWidth: 300, listOpen: true })).not.toThrow();
  });
});
