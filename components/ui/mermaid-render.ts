import type { Mermaid } from "mermaid";
import {
  isUnknownDiagram,
  MermaidSyntaxError,
  prepareForParse,
  toParseIssue,
  type ParseIssue,
} from "./mermaid-parse-issue";
import type { ErSnapshot, FlowSnapshot, MermaidSnapshot } from "./mermaid-snapshot";

/**
 * mermaid.js に触るのはこのモジュールだけ (spec 09 D3)。
 * mermaid は大きいので、最初に描く時に動的 import する。テストはこのモジュールを静的に模擬する
 * (jsdom では本物の mermaid が描けない。動的 import の模擬は途中で本物に差し替わる, failures #14)
 */
let loading: Promise<Mermaid> | null = null;

const loadMermaid = (): Promise<Mermaid> => {
  loading ??= import("mermaid")
    .then(({ default: mermaid }) => {
      // 版は package.json で 11.17.2 に固定 (書き出しの merman と同じ版, spec 09 D1)
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        // 描けない時に爆弾の SVG を body に出さず throw する
        suppressErrorRendering: true,
      });
      return mermaid;
    })
    .catch((e: unknown) => {
      // 読み込みに失敗したら次に開いた時にやり直す
      loading = null;
      throw e;
    });
  return loading;
};

/**
 * Mermaid を SVG の文字列にする。
 * `id` は描くたびに新しいものを渡す (mermaid は最初に同じ id の要素を消すので、使い回すと表示中の図が消える)。
 * `#id` の CSS セレクタにも使われるので、英字で始め、英数とハイフンだけにする
 */
export const renderMermaid = async (id: string, code: string, options?: MermaidReadOptions): Promise<string> => {
  const mermaid = await loadMermaid();
  return serial(async () => {
    try {
      return (await mermaid.render(id, code)).svg;
    } catch (e) {
      // 見出しの無いコードは補って描く (取り込み・赤線と同じ, spec 11 D2)
      const message = e instanceof Error ? e.message : String(e);
      if (!options?.defaultHeader || !isUnknownDiagram({ line: null, fromColumn: null, toColumn: null, message })) throw e;
      return (await mermaid.render(id, `${options.defaultHeader}\n${code}`)).svg;
    }
  });
};

/**
 * mermaid が解析の前に `#quot;` などを内部の符号 (`ﬂ°quot¶ß`) に替えたものを、HTML の実体参照を経て元の文字に戻す
 * (mermaid が描く時にする decodeEntities と同じ置き換え + 実体参照の解決)
 */
const decodeText = (text: unknown): string => {
  if (typeof text !== "string" || text === "") return "";
  const entities = text.replace(/ﬂ°°/g, "&#").replace(/ﬂ°/g, "&").replace(/¶ß/g, ";");
  if (!entities.includes("&")) return entities;
  const area = document.createElement("textarea");
  area.innerHTML = entities;
  return area.value;
};

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const mapValues = <T>(value: unknown): T[] =>
  value instanceof Map ? Array.from(value.values()) : value && typeof value === "object" ? Object.values(value) : [];

const sizeOf = (value: unknown): number =>
  value instanceof Map ? value.size : value && typeof value === "object" ? Object.keys(value).length : 0;

/* eslint-disable @typescript-eslint/no-explicit-any -- mermaid の db は型を公開していない。形はここで閉じる */
const accessibilityOf = (db: any): number =>
  [db.getAccTitle?.(), db.getAccDescription?.()].filter((v) => typeof v === "string" && v !== "").length;

const flowSnapshot = (db: any): FlowSnapshot => ({
  kind: "flowchart",
  direction: String(db.getDirection?.() ?? ""),
  vertices: mapValues<any>(db.getVertices()).map((v) => ({
    id: String(v.id),
    text: decodeText(v.text),
    type: typeof v.type === "string" ? v.type : undefined,
    // click を付けたノードには mermaid が clickable を自動で付ける (利用者の class ではない)。
    // strict では関数の click に haveCallback が付かず、印はこの class だけ (spec 11 rev1、査読 3)
    classes: list(v.classes).filter((c) => c !== "clickable"),
    styles: list(v.styles),
    clickable: list(v.classes).includes("clickable") || Boolean(v.link) || v.haveCallback === true,
  })),
  edges: (db.getEdges() as any[]).map((e) => ({
    start: String(e.start),
    end: String(e.end),
    type: String(e.type ?? ""),
    stroke: String(e.stroke ?? ""),
    text: decodeText(e.text),
    length: typeof e.length === "number" ? e.length : 1,
    classes: list(e.classes),
    styles: list(e.style),
  })),
  subgraphs: (db.getSubGraphs() as any[]).map((s) => ({
    id: String(s.id),
    title: decodeText(s.title),
    nodes: list(s.nodes),
    ...(typeof s.dir === "string" && s.dir !== "" ? { dir: s.dir } : {}),
  })),
  classDefs: sizeOf(db.getClasses?.()),
  tooltips: sizeOf(db.tooltips),
  accessibility: accessibilityOf(db),
});

const erSnapshot = (db: any): ErSnapshot => {
  const entries: [string, any][] =
    db.getEntities() instanceof Map ? Array.from(db.getEntities().entries()) : Object.entries(db.getEntities());
  // 名前は囲みの中の #quot; などが内部の符号のまま入る。関係の両端も同じ名前で指すので、ここで戻しておく (spec 13 D1)
  const nameOfId = new Map(entries.map(([name, e]) => [String(e.id), decodeText(name)]));
  // mermaid が振った id の末尾が出現順 (entity-<名前>-<n>)
  const order = (e: any) => Number(String(e.id).split("-").pop());
  entries.sort(([, a], [, b]) => order(a) - order(b));
  return {
    kind: "er",
    direction: String(db.getDirection?.() ?? ""),
    entities: entries.map(([name, e]) => ({
      name: decodeText(name),
      alias: decodeText(e.alias),
      attributes: (Array.isArray(e.attributes) ? e.attributes : []).map((a: any) => ({
        type: String(a.type ?? ""),
        name: decodeText(a.name),
        keys: list(a.keys),
        comment: decodeText(a.comment),
      })),
      classes: String(e.cssClasses ?? "")
        .split(/\s+/)
        .filter((c) => c !== "" && c !== "default"),
      styles: list(e.cssStyles),
    })),
    relationships: (db.getRelationships() as any[]).map((r) => ({
      from: nameOfId.get(String(r.entityA)) ?? String(r.entityA),
      to: nameOfId.get(String(r.entityB)) ?? String(r.entityB),
      label: decodeText(r.roleA),
      cardA: String(r.relSpec?.cardA ?? ""),
      cardB: String(r.relSpec?.cardB ?? ""),
      relType: String(r.relSpec?.relType ?? ""),
    })),
    subgraphs: ((db.getSubGraphs?.() ?? []) as any[]).map((s) => ({ id: String(s.id), nodes: list(s.nodes) })),
    classDefs: sizeOf(db.getClasses?.()),
    accessibility: accessibilityOf(db),
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * 描画・検査・読み取りを 1 本の列に並べる。getDiagramFromText は mermaid 自身の順番待ちの外で動き、
 * 全体の状態 (題・アクセシビリティ・設定) を触るので、プレビューの描画と重ねない (spec 11 rev1、査読 4)
 */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

/** 解析の選択肢 */
export interface MermaidReadOptions {
  /**
   * 図の種類が無い (見出しの無い) コードの時に補う見出し。例: "flowchart TD" (spec 11 D2)。
   * mermaid が「図の種類が無い」と言った時だけ補い、誤りの行は補う前の本文の行で返す
   */
  defaultHeader?: string;
}

type ReadResult = { ok: true; snapshot: MermaidSnapshot } | { ok: false; issue: ParseIssue };

const readOnce = async (code: string): Promise<ReadResult> => {
  const mermaid = await loadMermaid();
  const { text, lineOffset } = prepareForParse(code);
  let diagram;
  try {
    diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  } catch (e) {
    return { ok: false, issue: toParseIssue(e, lineOffset) };
  }
  // 写しは解析の直後に同期で取る (db は図ごとに新しく作られる)
  const type = String(diagram.type);
  if (type === "flowchart-v2" || type === "flowchart" || type === "flowchart-elk") {
    return { ok: true, snapshot: flowSnapshot(diagram.db) };
  }
  if (type === "er") return { ok: true, snapshot: erSnapshot(diagram.db) };
  return { ok: true, snapshot: { kind: "other", type } };
};

const shiftLine = (issue: ParseIssue, by: number): ParseIssue => ({
  ...issue,
  line: issue.line === null ? null : Math.max(1, issue.line + by),
});

/** 直前の本文の読み取りの結果。赤線 (parseMermaid) と要約 (readMermaidDiagram) が同じ本文を読む時に使い回す (査読 5) */
let last: { key: string; result: Promise<ReadResult> } | null = null;

const read = (code: string, options: MermaidReadOptions = {}): Promise<ReadResult> => {
  const key = `${options.defaultHeader ?? ""}\u0000${code}`;
  if (last?.key === key) return last.result;
  const result = serial(async () => {
    const first = await readOnce(code);
    if (first.ok || !options.defaultHeader || !isUnknownDiagram(first.issue)) return first;
    // 見出しを補って読み直す。誤りの行は補った 1 行を引いて本文の行にする
    const second = await readOnce(`${options.defaultHeader}\n${code}`);
    return second.ok ? second : { ok: false as const, issue: shiftLine(second.issue, -1) };
  });
  last = { key, result };
  return result;
};

/**
 * Mermaid を解析し、取り込みに使う素のデータの写しを返す (spec 11 D1)。文法の誤りは MermaidSyntaxError で throw する。
 * 行は利用者の見ている本文の行に直す (parseMermaid と同じ)
 */
export const readMermaidDiagram = async (code: string, options?: MermaidReadOptions): Promise<MermaidSnapshot> => {
  const result = await read(code, options);
  if (!result.ok) throw new MermaidSyntaxError(result.issue);
  return result.snapshot;
};

/**
 * Mermaid の文法を検める (spec 10 D5)。通れば null、誤りなら位置つきの 1 件。
 * 行は利用者の見ている本文の行に直して返す (mermaid は注釈と先頭の空白を消してから数える)
 */
export const parseMermaid = async (code: string, options?: MermaidReadOptions): Promise<ParseIssue | null> => {
  const result = await read(code, options);
  return result.ok ? null : result.issue;
};
