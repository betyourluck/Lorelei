import type { Edge } from "@xyflow/react";
import { describe, it, expect, vi } from "vitest";
import { convertParsedDataToNodes } from "../utils/import-mermaid-to-er";

describe("convertParsedDataToNodes", () => {
  it("ParsedERTableDataをReactFlowのNode型に変換", () => {
    const parsedData = [
      {
        id: "User",
        name: "User",
        columns: [
          { name: "id", type: "int", pk: true, uk: false },
          { name: "name", type: "string", pk: false, uk: false },
        ],
      },
      {
        id: "Post",
        name: "Post",
        columns: [
          { name: "id", type: "int", pk: true, uk: false },
          { name: "user_id", type: "int", pk: false, uk: false },
        ],
      },
    ];

    const mockHandlers = {
      onNameChange: vi.fn(),
      onColumnsChange: vi.fn(),
    };

    const mockEdges = [
      {
        id: "edge-1",
        type: "erEdge",
        source: "User",
        target: "Post",
        data: { label: "has", cardinality: "one-to-many" },
      },
    ];

    const result = convertParsedDataToNodes(parsedData, mockEdges, mockHandlers);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "User",
      type: "erTable",
      position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      data: {
        name: "User",
        columns: [
          { name: "id", type: "int", pk: true, uk: false },
          { name: "name", type: "string", pk: false, uk: false },
        ],
        onNameChange: expect.any(Function),
        onColumnsChange: expect.any(Function),
      },
    });

    expect(result[1]).toEqual({
      id: "Post",
      type: "erTable",
      position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      data: {
        name: "Post",
        columns: [
          { name: "id", type: "int", pk: true, uk: false },
          { name: "user_id", type: "int", pk: false, uk: false },
        ],
        onNameChange: expect.any(Function),
        onColumnsChange: expect.any(Function),
      },
    });
  });

  it("ハンドラーが正しく呼び出される", () => {
    const parsedData = [
      {
        id: "Test",
        name: "Test",
        columns: [],
      },
    ];

    const mockHandlers = {
      onNameChange: vi.fn(),
      onColumnsChange: vi.fn(),
    };

    const mockEdges: Edge[] = [];

    const result = convertParsedDataToNodes(parsedData, mockEdges, mockHandlers);

    // onNameChangeハンドラーをテスト
    result[0].data.onNameChange("NewName");
    expect(mockHandlers.onNameChange).toHaveBeenCalledWith("Test", "NewName");

    // onColumnsChangeハンドラーをテスト
    const newColumns = [{ name: "id", type: "int", pk: true, uk: false }];
    result[0].data.onColumnsChange(newColumns);
    expect(mockHandlers.onColumnsChange).toHaveBeenCalledWith("Test", newColumns);
  });
});

// spec 07 D1: 取り込み時は向きに沿って並べる
describe("convertParsedDataToNodes の向き", () => {
  it("LR で取り込むと、関係の段が左から右へ並ぶ", () => {
    const tables = ["A", "B", "C"].map((name) => ({ id: name, name, columns: [] }));
    const edges: Edge[] = [
      { id: "edge-0", type: "erEdge", source: "A", target: "B", data: { label: "has", cardinality: "one-to-many" } },
      { id: "edge-1", type: "erEdge", source: "B", target: "C", data: { label: "has", cardinality: "one-to-many" } },
    ];
    const handlers = { onNameChange: vi.fn(), onColumnsChange: vi.fn() };
    const nodes = convertParsedDataToNodes(tables, edges, handlers, "LR");
    const pos = (name: string) => nodes.find((n) => n.data.name === name)!.position;
    expect(pos("A").x).toBeLessThan(pos("B").x);
    expect(pos("B").x).toBeLessThan(pos("C").x);
    expect(pos("A").y).toBe(pos("B").y);
  });
});
