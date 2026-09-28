import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { mermaidCandidates, type MermaidKind, type MermaidOption } from "./mermaid-completion";
import type { ParseIssue } from "./mermaid-parse-issue";
import { parseMermaid } from "./mermaid-render";

/**
 * Mermaid の IntelliSense を CodeMirror につなぐ部分（spec 10 D4・D5）。候補を決めるのは純粋関数 mermaidCandidates、
 * 文法を検めるのは境界 parseMermaid。ここは CodeMirror の形に写すだけ
 */

const TYPE_OF: Record<MermaidOption["type"], string> = {
  keyword: "keyword",
  variable: "variable",
  type: "type",
  operator: "operator",
};

function toCompletion(option: MermaidOption): Completion {
  const insert = option.insert ?? option.label;
  return {
    label: option.label,
    detail: option.detail,
    type: TYPE_OF[option.type],
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      // 形は直前の空白を詰めて ID に続ける
      const start = from - (option.eatBefore ?? 0);
      const [selFrom, selTo] = option.select ?? [insert.length, insert.length];
      view.dispatch({
        changes: { from: start, to, insert },
        selection: { anchor: start + selFrom, head: start + selTo },
        userEvent: "input.complete",
      });
    },
  };
}

/** 補完の供給源 */
export function mermaidCompletionSource(kind?: MermaidKind) {
  return (context: CompletionContext): CompletionResult | null => {
    const r = mermaidCandidates(context.state.doc.toString(), context.pos, kind);
    if (!r.options.length) return null;
    // 行頭などは打ち始めてから (Ctrl+Space なら開く)。Enter の改行で候補を確定させない
    if (!r.typed && !r.auto && !context.explicit) return null;
    return { from: r.from, options: r.options.map(toCompletion), validFor: r.validFor };
  };
}

/** 取り込むと消える行の印（spec 11 D4）。1 始まりの行と文 */
export interface LineWarning {
  line: number;
  message: string;
}

/**
 * 文法の誤りの赤線と、取り込むと消える行の黄色の印。500ms 止まったら検める（Kataribe と同じ遅延）。
 * `getWarnings` は呼ぶたびに今の関数を返す（props の関数が替わっても作り直さない）
 */
export function mermaidLinter(
  getWarnings?: () => ((text: string) => LineWarning[]) | undefined,
  /** 見出しの無いコードの時に補う見出し（取り込み・プレビューと同じ補い, spec 11 D2） */
  defaultHeader?: string
) {
  return linter(
    async (view): Promise<Diagnostic[]> => {
      const text = view.state.doc.toString();
      if (!text.trim()) return [];
      const doc = view.state.doc;
      const warnings: Diagnostic[] = (getWarnings?.()?.(text) ?? [])
        .filter((w) => w.line >= 1 && w.line <= doc.lines)
        .map((w) => {
          const line = doc.line(w.line);
          return { from: line.from, to: line.to, severity: "warning", message: w.message };
        });
      const issue = await parseMermaid(text, { defaultHeader });
      if (!issue) return warnings;
      return [...lintIssue(issue, doc), ...warnings];
    },
    { delay: 500 }
  );
}

/** 文法の誤り 1 件を赤線にする。位置が分からなければ先頭に出す（位置を偽らない） */
function lintIssue(issue: ParseIssue, doc: Text): Diagnostic[] {
  if (issue.line === null || issue.line < 1 || issue.line > doc.lines) {
    return [{ from: 0, to: Math.min(doc.length, doc.line(1).length), severity: "error", message: issue.message }];
  }
  const line = doc.line(issue.line);
  const clamp = (col: number) => line.from + Math.max(0, Math.min(col, line.length));
  let from = issue.fromColumn === null ? line.from : clamp(issue.fromColumn);
  let to = issue.toColumn === null ? line.to : clamp(issue.toColumn);
  if (to <= from) {
    // 語の範囲が取れない時は行全体
    from = line.from;
    to = line.to;
  }
  return [{ from, to, severity: "error", message: issue.message }];
}
