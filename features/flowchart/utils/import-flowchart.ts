/**
 * フローチャートのインポートが使う読み取り (spec 11 D2・D3)。mermaid.js で解析し、エディタの取り込みの形にする
 */
import type { DroppedItem } from "@/components/ui/mermaid-dropped";
import { describeSyntaxError, MermaidSyntaxError } from "@/components/ui/mermaid-parse-issue";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import type { MermaidSnapshot } from "@/components/ui/mermaid-snapshot";
import type { ParsedMermaidData } from "../hooks/mermaid";
import { flowFromMermaid } from "./from-mermaid";

export type FlowchartImport =
  | { ok: true; data: ParsedMermaidData; dropped: DroppedItem[] }
  | { ok: false; error: string };

/** 見出しの無いコード (`A --> B` だけ) もフォーク元は読んだので、補って読む (D2)。プレビュー・赤線・要約にも同じ補いを通す */
export const FLOWCHART_DEFAULT_HEADER = "flowchart TD";

export async function readFlowchartForImport(code: string): Promise<FlowchartImport> {
  let snapshot: MermaidSnapshot;
  try {
    snapshot = await readMermaidDiagram(code, { defaultHeader: FLOWCHART_DEFAULT_HEADER });
  } catch (e) {
    if (!(e instanceof MermaidSyntaxError)) throw e;
    return { ok: false, error: describeSyntaxError(e.issue) };
  }
  if (snapshot.kind !== "flowchart") {
    return {
      ok: false,
      error: "フローチャートではありません（erDiagram などはそれぞれのエディタのインポートで取り込んでください）",
    };
  }
  return { ok: true, ...flowFromMermaid(snapshot) };
}
