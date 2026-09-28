"use client";

/**
 * CodeMirror 6 の薄い包み（spec 10 D2）。Kataribe の CodeEditor.vue を React に写した。
 *
 * **ダイアログからは直接 import しない** — `lazy-code-editor.tsx`（next/dynamic）を通す。
 * ここが import する `@codemirror/*` がページの最初の読み込みに入らないように（spec 10 D1）
 */
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorState, findClusterBreak } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
  tooltips,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef, useState } from "react";
import { EDITOR_PHRASES_JA } from "./editor-phrases";
import { countChars, overwriteSpan } from "./editor-typing";
import type { MermaidKind } from "./mermaid-completion";
import { mermaidCompletionSource, mermaidLinter, type LineWarning } from "./mermaid-intellisense";
import { mermaidLanguage } from "./mermaid-language";

export interface CodeEditorProps {
  value: string;
  /** 利用者の打鍵で変わった時だけ呼ぶ（value を外から変えた時は呼ばない） */
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** エディタの高さ（CSS 値）。既定は親いっぱい */
  height?: string;
  /** どのダイアログのエディタか。補完の 1 行目を絞る */
  mermaid?: MermaidKind;
  /** 補完と文法の赤線を付ける（インポートだけ） */
  intellisense?: boolean;
  /** フッタ（行・列・行数・文字数・挿入/上書き）を出す。Insert の上書き切り替えもこれに連動する */
  status?: boolean;
  /** 取り込むと消える行の印（黄色の警告, spec 11 D4）。intellisense の時だけ使う */
  warnings?: (text: string) => LineWarning[];
  /** 見出しの無いコードの時に補う見出し（赤線の検めにも通す, spec 11 D2） */
  defaultHeader?: string;
  "aria-label"?: string;
}

/** value を外から差し替えた印。この変化では onChange を出さない */
const external = Annotation.define<boolean>();

/** 今のコードの見た目（VS Code Dark+）に合わせた暗い固定の配色 */
const darkTheme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "#1e1e1e", color: "#d4d4d4", fontSize: "14px" },
    "&.cm-focused": { outline: "1px solid #007fd4" },
    ".cm-scroller": {
      fontFamily: '"Fira code", "Fira Mono", Consolas, Monaco, "Courier New", monospace',
      lineHeight: "1.5",
      overflow: "auto",
    },
    ".cm-content": { padding: "8px 0", caretColor: "#aeafad" },
    ".cm-gutters": { backgroundColor: "#1e1e1e", color: "#858585", border: "none" },
    ".cm-activeLine": { backgroundColor: "#2a2d2e" },
    ".cm-activeLineGutter": { backgroundColor: "#2a2d2e", color: "#c6c6c6" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#264f78",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#aeafad" },
    ".cm-placeholder": { color: "#8a8a8a" },
    ".cm-searchMatch": { backgroundColor: "#515c6a", outline: "1px solid #74879f" },
    ".cm-selectionMatch": { backgroundColor: "#3a3d41" },
    ".cm-panels": { backgroundColor: "#252526", color: "#cccccc" },
    ".cm-panels-top": { borderBottom: "1px solid #454545" },
    ".cm-textfield": { backgroundColor: "#3c3c3c", color: "#cccccc", border: "1px solid #3c3c3c" },
    ".cm-button": { backgroundImage: "none", backgroundColor: "#3c3c3c", color: "#cccccc", border: "1px solid #3c3c3c" },
  },
  { dark: true }
);

/** ツールチップは body に出すので、エディタの外の規則として書く（z-index はダイアログより上） */
const tooltipTheme = EditorView.theme(
  {
    ".cm-tooltip": {
      zIndex: "2000",
      border: "1px solid #454545",
      backgroundColor: "#252526",
      color: "#cccccc",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#04395e", color: "#ffffff" },
    ".cm-completionDetail": { color: "#9d9d9d", marginLeft: "0.75em", fontStyle: "normal" },
    ".cm-diagnostic": { whiteSpace: "pre-wrap", fontFamily: "monospace" },
  },
  { dark: true }
);

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#569cd6" },
  { tag: tags.atom, color: "#569cd6" },
  { tag: tags.string, color: "#ce9178" },
  { tag: tags.comment, color: "#6a9955" },
  { tag: tags.operator, color: "#c586c0" },
  { tag: tags.variableName, color: "#9cdcfe" },
  { tag: tags.typeName, color: "#4ec9b0" },
  { tag: tags.propertyName, color: "#dcdcaa" },
  { tag: tags.meta, color: "#dcdcaa" },
  { tag: tags.bracket, color: "#ffd700" },
  { tag: tags.punctuation, color: "#d4d4d4" },
]);

interface StatusInfo {
  line: number;
  col: number;
  lines: number;
  chars: number;
}

function statusOf(state: EditorState, previousChars?: number): StatusInfo {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  return {
    line: line.number,
    // 列もコードポイントで数える（文字数と同じ物差し）
    col: countChars(line.text.slice(0, pos - line.from)) + 1,
    lines: state.doc.lines,
    chars: previousChars ?? countChars(state.doc.toString()),
  };
}

export const CodeEditor = ({
  value,
  onChange,
  readOnly = false,
  placeholder = "",
  height = "100%",
  mermaid,
  intellisense = false,
  status = false,
  warnings,
  defaultHeader,
  "aria-label": ariaLabel,
}: CodeEditorProps) => {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 最新の onChange を呼ぶ（作った時の関数のままにしない）
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // 行の印の関数も最新を使う（関数が替わってもエディタを作り直さない）
  const warningsRef = useRef(warnings);
  warningsRef.current = warnings;
  const overwriteRef = useRef(false);
  const [overwrite, setOverwrite] = useState(false);
  const [info, setInfo] = useState<StatusInfo | null>(null);
  const readOnlyCompartment = useRef(new Compartment()).current;
  const placeholderCompartment = useRef(new Compartment()).current;

  // エディタは 1 つだけ作る（StrictMode の二度走りでも cleanup で壊してから作り直す）
  useEffect(() => {
    if (!host.current) return;
    const overwriteHandler = EditorView.inputHandler.of((view, from, to, text) => {
      if (!overwriteRef.current || from !== to || text.length === 0) return false;
      const line = view.state.doc.lineAt(from);
      const offset = from - line.from;
      const span = overwriteSpan(line.length, offset, findClusterBreak(line.text, offset));
      if (span === 0) return false;
      view.dispatch({
        changes: { from, to: from + span, insert: text },
        selection: { anchor: from + text.length },
        userEvent: "input.type",
      });
      return true;
    });
    const toggleOverwrite = () => {
      overwriteRef.current = !overwriteRef.current;
      setOverwrite(overwriteRef.current);
      return true;
    };

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          EditorView.lineWrapping,
          highlightActiveLine(),
          search({ top: true }),
          highlightSelectionMatches(),
          // 補完・赤線の窓はダイアログの枠で切れないよう body に出す
          tooltips({ parent: document.body }),
          closeBrackets(),
          mermaidLanguage,
          syntaxHighlighting(highlight),
          darkTheme,
          tooltipTheme,
          EditorState.phrases.of(EDITOR_PHRASES_JA),
          ...(intellisense
            ? [
                autocompletion({ override: [mermaidCompletionSource(mermaid)] }),
                mermaidLinter(() => warningsRef.current, defaultHeader),
                lintGutter(),
              ]
            : []),
          ...(status && !readOnly ? [overwriteHandler] : []),
          keymap.of([
            // 上書き切り替えはフッタを出している時だけ（モードが見えない所で打鍵の意味を変えない）
            ...(status && !readOnly ? [{ key: "Insert", run: toggleOverwrite }] : []),
            // WebView の Ctrl+R は画面を作り直し、編集中の本文が消える。エディタにいる間は飲む
            { key: "Mod-r", run: () => true },
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...completionKeymap,
          ]),
          readOnlyCompartment.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          placeholderCompartment.of(placeholderExt(placeholder)),
          ...(ariaLabel ? [EditorView.contentAttributes.of({ "aria-label": ariaLabel })] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external))) {
              onChangeRef.current?.(update.state.doc.toString());
            }
            if (status && (update.docChanged || update.selectionSet)) {
              setInfo((prev) => statusOf(update.state, update.docChanged ? undefined : prev?.chars));
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (status) setInfo(statusOf(view.state));

    // CodeMirror は補完の窓・検索パネルを閉じる Esc で preventDefault するだけで伝播を止めない。
    // ダイアログ (Yamada) は defaultPrevented を見ずに Esc で閉じるので、CodeMirror が使った Esc はここで止める
    const wrapper = host.current;
    const stopUsedEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.defaultPrevented) e.stopPropagation();
    };
    wrapper.addEventListener("keydown", stopUsedEscape);

    return () => {
      wrapper.removeEventListener("keydown", stopUsedEscape);
      view.destroy();
      viewRef.current = null;
    };
    // 作り直すのは設定が変わった時だけ。value・readOnly・placeholder は下の effect で差し替える
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intellisense, mermaid, status, defaultHeader]);

  // value を外から変えた時（コード生成で向きを変えた時）は、差し替えの印を付けて入れ替える
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: external.of(true),
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly, readOnlyCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: placeholderCompartment.reconfigure(placeholderExt(placeholder)) });
  }, [placeholder, placeholderCompartment]);

  return (
    <div style={{ height, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 6 }}>
      <div ref={host} style={{ flex: 1, minHeight: 0, overflow: "hidden" }} />
      {status && info && (
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexShrink: 0,
            padding: "2px 8px",
            background: "#007acc",
            color: "#ffffff",
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: "20px",
          }}
        >
          <span>{`${info.line} 行目・${info.col} 列`}</span>
          <span>{`${info.lines} 行・${info.chars} 文字`}</span>
          {!readOnly && <span style={{ marginLeft: "auto", fontWeight: overwrite ? 700 : 400 }}>{overwrite ? "上書き" : "挿入"}</span>}
        </div>
      )}
    </div>
  );
};
