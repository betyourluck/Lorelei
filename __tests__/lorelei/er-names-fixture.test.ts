/**
 * spec 13 P3: ER 図の生成器の出力 (名前の格子) を、Rust の取り込み (lorelei_core::to_editor) のテストへ渡す fixture。
 * 生成器のコードは mermaid.js (TS の取り込み) と merman (デスクトップで開き直す・MCP) の両方が読む。TS の往復は
 * features/er-diagram/__tests__/round-trip-mermaid.test.ts、Rust の往復は crates/lorelei_core/tests/editor.rs が同じ入力で検める。
 * 生成器を変えてこのテストが落ちたら、LORELEI_UPDATE_FIXTURES=1 で回して fixture を書き直し、Rust のテストも回す
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { generateERDiagramMermaidCode } from "@/features/er-diagram/utils/generate-mermaid-code";

const FIXTURE = path.resolve(__dirname, "../../crates/lorelei_core/tests/fixtures/er_names.json");

// round-trip-mermaid.test.ts の NAMES と同じ
const NAMES = [
  "ユーザー", "注文 明細", "tokens", "topic", "oneshot", "manyToMany", "to", "one", "many", "end", "End", "end注文",
  "style", "style注文", "class", "classes", "classDef", "subgraph", "erDiagram", "direction", "accTitle", "accDescr",
  "u-id", "u.x", "u注文", "1abc", "２番", "a.b", "a*b", "a(b)", "a:b", "a~b", "😀絵", "é",
  'a"b', "#1;", "a#b", "a&amp;b", "50%", "C:\\dir", "direction LR", "x direction TB y", "direction\u3000rl",
  "one-to-one", "one-to-many", "many-to-one", "many-to-many", "zero-to-one", "one-to-zero", "one-to-many-mandatory",
];

/** テーブル name (列 int id PK) と B、B → name の関係のラベルも name */
const source = (name: string) =>
  generateERDiagramMermaidCode(
    [
      { id: "t1", type: "erTable", position: { x: 0, y: 0 }, data: { name, columns: [{ name: "id", type: "int", pk: true, uk: false }] } },
      { id: "t2", type: "erTable", position: { x: 0, y: 0 }, data: { name: "B", columns: [] } },
    ] as never,
    [{ id: "e", type: "erEdge", source: "t2", target: "t1", data: { label: name, cardinality: "one-to-many" } }] as never
  );

describe("Rust の取り込みのテストへ渡す fixture (spec 13 P3)", () => {
  test("fixture が今の生成器の出力と同じ", () => {
    const expected = NAMES.map((name) => ({ name, source: source(name) }));
    if (process.env.LORELEI_UPDATE_FIXTURES) {
      writeFileSync(FIXTURE, `${JSON.stringify(expected, null, 2)}\n`);
    }
    expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(expected);
  });
});
