/**
 * ER 図のインポートが使う読み取り (spec 11 D3)。mermaid.js で解析し、エディタの取り込みの形にする
 */
import type { DroppedItem } from "@/components/ui/mermaid-dropped";
import { describeSyntaxError, MermaidSyntaxError } from "@/components/ui/mermaid-parse-issue";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import type { MermaidSnapshot } from "@/components/ui/mermaid-snapshot";
import { erFromMermaid } from "./from-mermaid";
import type { ParsedMermaidERData } from "./import-mermaid-to-er";

export type ErImport = { ok: true; data: ParsedMermaidERData; dropped: DroppedItem[] } | { ok: false; error: string };

export async function readErForImport(code: string): Promise<ErImport> {
  let snapshot: MermaidSnapshot;
  try {
    snapshot = await readMermaidDiagram(code);
  } catch (e) {
    if (!(e instanceof MermaidSyntaxError)) throw e;
    return { ok: false, error: describeSyntaxError(e.issue) };
  }
  if (snapshot.kind !== "er") {
    return {
      ok: false,
      error: "ER 図ではありません（flowchart などはそれぞれのエディタのインポートで取り込んでください）",
    };
  }
  return { ok: true, ...erFromMermaid(snapshot) };
}
