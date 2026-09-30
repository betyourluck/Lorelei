import type { Node } from "@xyflow/react";
import type { MermaidArrowType, MermaidShapeType, GraphType } from "../types/types";
import { SUBGRAPH_NODE_TYPE } from "../utils/subgraph-tree";
import type { FlowData } from "./flow-helpers";

/**
 * パースされたMermaidデータの型定義
 */
export interface ParsedMermaidData {
  nodes: ParsedMermaidNode[];
  edges: ParsedMermaidEdge[];
  /** 図の向き。TD (と同じ意味の TB) の時は持たない (無ければ TD) */
  direction?: GraphType;
  /** サブグラフ (枠, spec 15 D1)。親が子より前に並ぶ。無ければ持たない */
  subgraphs?: ParsedMermaidSubgraph[];
}

/**
 * サブグラフ (枠) の型定義 (spec 15 D1)。nodes は直下のノードの ID だけで、入れ子は子の枠の parent で表す
 */
export interface ParsedMermaidSubgraph {
  id: string;
  title: string;
  nodes: string[];
  parent?: string;
}

/**
 * パースされたMermaidノードの型定義
 */
export interface ParsedMermaidNode {
  id: string;
  variableName: string;
  label: string;
  shapeType: MermaidShapeType;
}

/**
 * パースされたMermaidエッジの型定義
 */
export interface ParsedMermaidEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  arrowType: MermaidArrowType;
}

// Mermaidの予約語リスト
const RESERVED_WORDS = new Set([
  "end",
  "start",
  "subgraph",
  "class",
  "classDef",
  "click",
  "style",
  "linkStyle",
  "direction",
  "flowchart",
  "graph",
  "if",
  "else",
  "elseif",
  "while",
  "for",
  "function",
  "return",
  "break",
  "continue",
]);

/**
 * Mermaidで安全に使用できる変数名を生成する
 * @param variableName 元の変数名
 * @returns 安全な変数名
 */
export const getSafeVariableName = (variableName: string): string => {
  // 空文字チェック
  if (!variableName || variableName.trim() === "") {
    return "node_unnamed";
  }

  let safeName = variableName.trim();

  // 予約語チェック
  if (RESERVED_WORDS.has(safeName.toLowerCase())) {
    safeName = `node_${safeName}`;
  }

  // 先頭が数字の場合はアンダースコアを追加
  if (/^[0-9]/.test(safeName)) {
    safeName = `_${safeName}`;
  }

  // スペースやタブなどの空白文字のみアンダースコアに変換
  // 日本語文字（ひらがな、カタカナ、漢字）は保持
  safeName = safeName.replace(/\s+/g, "_");

  // 特殊記号のみ変換（日本語文字は保持）
  safeName = safeName.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, "_");

  return safeName;
};

/**
 * 予約語のリストを取得する
 * @returns 予約語のSet
 */
export const getReservedWords = (): Set<string> => {
  return new Set(RESERVED_WORDS);
};

/**
 * ノードの形状タイプをMermaidの記法に変換する
 * @param shapeType 形状タイプ
 * @param label ノードラベル
 * @returns Mermaidの形状記法
 */
export const formatMermaidShape = (shapeType: MermaidShapeType, rawLabel: string): string => {
  const label = quoteNodeLabel(rawLabel);
  switch (shapeType) {
    case "rectangle":
      return `[${label}]`;
    case "diamond":
      return `{${label}}`;
    case "rounded":
      return `(${label})`;
    case "circle":
      return `((${label}))`;
    case "hexagon":
      return `{{${label}}}`;
    case "stadium":
      return `([${label}])`;
    default:
      return `[${label}]`; // デフォルトは四角形
  }
};

/**
 * 引用符で囲んだラベルの中の " を mermaid の実体参照にする (`\"` は mermaid では通るが " が消えて \ が残る, spec 11 P0)
 */
const ENTITY_HASH = new RegExp("#(?=[\\p{L}\\p{N}_]+;)", "gu");
/**
 * mermaid.js は囲みの中でも、小文字の `direction` + 空白 + 大文字の向きを行のどこでも向きの指定として食い、
 * その行のノードと線が黙って消える (spec 15 D8。`Direction LR` や `direction lr` は食わない)。空白を実体参照にして避ける
 */
const DIRECTION_RUN = /(direction)(\s+)(?=(?:TB|TD|BT|RL|LR))/g;
const HAS_DIRECTION_RUN = /direction\s+(?:TB|TD|BT|RL|LR)/;
const escapeQuoted = (label: string): string =>
  // mermaid は #語; を実体参照として読むので、その # は #35; にする。direction の空白の #…; はその後に入れる (書き換えられないように)
  `"${label
    .replace(ENTITY_HASH, "#35;")
    .replace(/"/g, "#quot;")
    .replace(
      DIRECTION_RUN,
      (_m, word: string, space: string) =>
        word + Array.from(space, (c) => `#${c.codePointAt(0)};`).join("")
    )}"`;

/**
 * ノードのラベル。括弧・縦棒・引用符は囲まないと mermaid の文法の誤りになるので、その時だけ囲む (spec 11 D5)。
 * `#語;` を含む時も囲んで # を逃がす。空のラベルは空白 1 つを囲む (B[] ・ B[""] は誤り)。
 * それ以外 (日本語・記号 : ; # % / ？ など) は今までどおりそのまま書く
 */
const HAS_ENTITY = new RegExp("#[\\p{L}\\p{N}_]+;", "u");
const quoteNodeLabel = (label: string): string => {
  if (label === "") return '" "';
  return /[()[\]{}|"]/.test(label) || HAS_ENTITY.test(label) || HAS_DIRECTION_RUN.test(label)
    ? escapeQuoted(label)
    : label;
};

/**
 * 枠の題 (spec 15 D2)。いつも囲む (題が ID と同じでも省かない)。空の題は空白 1 つを囲む (`[""]` は mermaid.js の誤り, P0)
 */
const quoteSubgraphTitle = (title: string): string => (title === "" ? '" "' : escapeQuoted(title));

/**
 * Mermaidラベルをサニタイズする
 * @param label ラベル文字列
 * @returns サニタイズされたラベル
 */
const sanitizeMermaidLabel = (label: string): string => {
  // 空文字列の場合はそのまま返す
  if (!label || label.trim() === "") {
    return label;
  }

  // direction + 空白 + 向き は囲んで空白を逃がす (spec 15 D8)
  if (HAS_DIRECTION_RUN.test(label)) {
    return escapeQuoted(label);
  }

  // 数字のみの場合は文字列として扱う（引用符は使わない）
  if (/^\d+$/.test(label.trim())) {
    return label.trim();
  }

  // 英数字とハイフン、アンダースコア、日本語のみの場合はそのまま
  if (/^[a-zA-Z0-9\-_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s]+$/.test(label)) {
    return label;
  }

  // 特殊文字が含まれる場合は引用符で囲む
  return escapeQuoted(label);
};

/**
 * 矢印タイプをMermaidの記法に変換する
 * @param arrowType 矢印タイプ
 * @param label エッジラベル
 * @returns Mermaidの矢印記法
 */
export const formatMermaidArrow = (
  arrowType: MermaidArrowType = "arrow",
  label?: string
): string => {
  const hasLabel = label && label.trim() !== "";
  const sanitizedLabel = hasLabel ? sanitizeMermaidLabel(label!) : "";

  switch (arrowType) {
    case "arrow":
      return hasLabel ? ` -->|${sanitizedLabel}| ` : " --> ";
    case "thick":
      return hasLabel ? ` ==>|${sanitizedLabel}| ` : " ==> ";
    case "dotted":
      // Mermaidの点線矢印のラベル記法: -. ラベル .->
      return hasLabel ? ` -. ${sanitizedLabel} .-> ` : " -.-> ";
    case "invisible":
      return hasLabel ? ` ~~~|${sanitizedLabel}| ` : " ~~~ ";
    case "bidirectional":
      return hasLabel ? ` <-->|${sanitizedLabel}| ` : " <--> ";
    case "bidirectional-thick":
      return hasLabel ? ` <==${sanitizedLabel}==> ` : " <==> ";
    default:
      return hasLabel ? ` -->|${sanitizedLabel}| ` : " --> ";
  }
};

/**
 * 矢印タイプの記号を取得する
 * @param arrowType 矢印タイプ
 * @returns 矢印記号
 */
export const getArrowTypeSymbol = (arrowType: MermaidArrowType): string => {
  switch (arrowType) {
    case "arrow":
      return "→";
    case "thick":
      return "⇒";
    case "dotted":
      return "⇢";
    case "invisible":
      return "～";
    case "bidirectional":
      return "↔";
    case "bidirectional-thick":
      return "⇔";
    default:
      return "→";
  }
};

/**
 * 矢印タイプの表示名を取得する
 * @param arrowType 矢印タイプ
 * @returns 表示名
 */
export const getArrowTypeDisplayName = (arrowType: MermaidArrowType): string => {
  switch (arrowType) {
    case "arrow":
      return "通常の矢印 (->)";
    case "thick":
      return "太い矢印 (==>)";
    case "dotted":
      return "点線矢印 (-.->)";
    case "invisible":
      return "非表示 (~~~)";
    case "bidirectional":
      return "双方向矢印 (<->)";
    case "bidirectional-thick":
      return "太い双方向矢印 (<==>)";
    default:
      return "通常の矢印 (->)";
  }
};

/**
 * FlowDataからMermaidコードを生成する
 * @param flowData ノードとエッジのデータ
 * @param direction フローチャートの方向 (TD, LR, RL, BT)
 * @returns Mermaidコード
 */
export const generateMermaidCode = (flowData: FlowData, direction: GraphType = "TD"): string => {
  let code = `flowchart ${direction}\n`;

  // ノードの定義。枠 (spec 15 D2) は subgraph … end で囲み、中のノードと子の枠を 4 字ずつ下げて書く。
  // 枠の無い図は今までどおり (直下のノードを並べた順に 4 字下げ)
  const byId = new Map(flowData.nodes.map((node) => [node.id, node]));
  const isFrame = (node: Node | undefined): boolean => node?.type === SUBGRAPH_NODE_TYPE;
  const parentOf = (id: string): string | undefined => {
    const parentId = byId.get(id)?.parentId;
    return parentId !== undefined && isFrame(byId.get(parentId)) ? parentId : undefined;
  };
  // 親を辿って同じ枠に戻る (親子が輪になった) 枠は図の直下に書く (書き落とさない)
  const inCycle = (id: string): boolean => {
    const seen = new Set([id]);
    for (let p = parentOf(id); p !== undefined; p = parentOf(p)) {
      if (seen.has(p)) return true;
      seen.add(p);
    }
    return false;
  };
  const children = new Map<string | undefined, Node[]>();
  flowData.nodes.forEach((node) => {
    const parent = isFrame(node) && inCycle(node.id) ? undefined : parentOf(node.id);
    children.set(parent, [...(children.get(parent) ?? []), node]);
  });
  const writeNodes = (parent: string | undefined, indent: string): void => {
    (children.get(parent) ?? []).forEach((node) => {
      if (isFrame(node)) {
        const frameName = getSafeVariableName(
          (node.data.variableName as string) || `group${node.id}`
        );
        code += `${indent}subgraph ${frameName}[${quoteSubgraphTitle((node.data.title as string) || "")}]\n`;
        writeNodes(node.id, `${indent}    `);
        code += `${indent}end\n`;
        return;
      }
      const variableName = (node.data.variableName as string) || `node${node.id}`;
      const safeVariableName = getSafeVariableName(variableName);
      const shapeType = (node.data.shapeType as MermaidShapeType) || "rectangle";
      const label = (node.data.label as string) || "";
      const shapeCode = formatMermaidShape(shapeType, label);
      code += `${indent}${safeVariableName}${shapeCode}\n`;
    });
  };
  writeNodes(undefined, "    ");

  // エッジの定義。線は全部、枠の外 (最後) に書く (ブロックの中に書くと外のノードを枠へ引き込む, spec 15 D2)
  flowData.edges.forEach((edge) => {
    const sourceNode = byId.get(edge.source);
    const targetNode = byId.get(edge.target);

    // 枠を指す線はエディタでは作れない (spec 15 D6)。あっても書かない
    if (sourceNode && targetNode && !isFrame(sourceNode) && !isFrame(targetNode)) {
      const sourceVariableName = getSafeVariableName(
        (sourceNode.data.variableName as string) || `node${sourceNode.id}`
      );
      const targetVariableName = getSafeVariableName(
        (targetNode.data.variableName as string) || `node${targetNode.id}`
      );
      const edgeLabel = edge.data?.label as string | undefined;
      const arrowType = (edge.data?.arrowType as MermaidArrowType) || "arrow";

      const arrowCode = formatMermaidArrow(arrowType, edgeLabel);
      code += `    ${sourceVariableName}${arrowCode}${targetVariableName}\n`;
    }
  });

  return code;
};
