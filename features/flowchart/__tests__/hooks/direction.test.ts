import { Position } from "@xyflow/react";
import { describe, expect, test } from "vitest";
import { handlePositions, normalizeDirection, placeByDirection } from "@/features/flowchart/hooks/direction";

// spec 07 D1: 図の向き。TB は TD と同じ。配置は「軸」と「逆向き」に分けて決める
describe("normalizeDirection", () => {
  test("TD / LR / RL / BT はそのまま、TB は TD、ほかは TD", () => {
    expect(normalizeDirection("LR")).toBe("LR");
    expect(normalizeDirection("RL")).toBe("RL");
    expect(normalizeDirection("BT")).toBe("BT");
    expect(normalizeDirection("TB")).toBe("TD");
    expect(normalizeDirection("TD")).toBe("TD");
    expect(normalizeDirection(undefined)).toBe("TD");
    expect(normalizeDirection("XX")).toBe("TD");
  });
});

describe("placeByDirection", () => {
  const c = { levelGap: 100, spacing: 50, start: 0 };
  // 3 段 (0, 1, 2)。段 1 に 2 つ並ぶ
  const at = (direction: Parameters<typeof placeByDirection>[1], level: number, index: number, count: number) =>
    placeByDirection({ level, index, count, maxLevel: 2 }, direction, c);

  test("TD: 段は上から下 (y)、同じ段は横 (x)", () => {
    expect(at("TD", 0, 0, 1).y).toBeLessThan(at("TD", 2, 0, 1).y);
    expect(at("TD", 1, 0, 2).y).toBe(at("TD", 1, 1, 2).y);
    expect(at("TD", 1, 0, 2).x).toBeLessThan(at("TD", 1, 1, 2).x);
  });

  test("LR: 段は左から右 (x)、同じ段は縦 (y)", () => {
    expect(at("LR", 0, 0, 1).x).toBeLessThan(at("LR", 2, 0, 1).x);
    expect(at("LR", 1, 0, 2).x).toBe(at("LR", 1, 1, 2).x);
    expect(at("LR", 1, 0, 2).y).toBeLessThan(at("LR", 1, 1, 2).y);
  });

  test("BT / RL は段の順を反対に", () => {
    expect(at("BT", 0, 0, 1).y).toBeGreaterThan(at("BT", 2, 0, 1).y);
    expect(at("RL", 0, 0, 1).x).toBeGreaterThan(at("RL", 2, 0, 1).x);
  });
});

describe("handlePositions", () => {
  test("入口と出口を向きに合わせる", () => {
    expect(handlePositions("TD")).toEqual({ target: Position.Top, source: Position.Bottom });
    expect(handlePositions("BT")).toEqual({ target: Position.Bottom, source: Position.Top });
    expect(handlePositions("LR")).toEqual({ target: Position.Left, source: Position.Right });
    expect(handlePositions("RL")).toEqual({ target: Position.Right, source: Position.Left });
  });
});
