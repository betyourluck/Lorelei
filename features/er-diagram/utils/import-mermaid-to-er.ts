import type { Node, Edge } from "@xyflow/react";
import { placeByDirection } from "@/features/flowchart/hooks/direction";
import type { GraphType } from "@/features/flowchart/types/types";
import type { ERColumn } from "../components/node/er-table-content";
import type { ERTableNodeProps } from "../components/node/er-table-node";

/**
 * パースされたERテーブルデータの型定義（純粋なデータのみ、UIハンドラーなし）
 * flowchartのParsedMermaidNodeと同じ設計パターン
 */
export interface ParsedERTableData {
  id: string;
  name: string;
  columns: ERColumn[];
}

/**
 * パースされたMermaidデータの型定義
 */
export interface ParsedMermaidERData {
  nodes: ParsedERTableData[];
  edges: Edge[];
  /** 図の向き。TD (と同じ意味の TB) の時は持たない (無ければ TD) */
  direction?: GraphType;
}

/**
 * ER図レイアウト定数
 * @description flowchartを参考にしつつ、テーブルサイズに合わせて調整した配置パラメータ
 * @reference flowchart レイアウト機能と同じ設計パターンを採用
 * @rationale ERテーブルはフローチャートのノードより大きいため、間隔を拡大して配置
 */
const ER_LAYOUT_CONSTANTS = {
  /**
   * テーブル間の縦間隔
   * @description 階層レベル間のY軸方向の距離
   * @unit ピクセル（px）
   * @value 280
   * @rationale テーブルの高さ（約200px）を考慮して十分な余白を確保
   */
  LEVEL_HEIGHT: 280,

  /**
   * 同レベル内のテーブル間隔
   * @description 同じ階層レベル内でのテーブル間のX軸方向の距離
   * @unit ピクセル（px）
   * @value 450
   * @rationale テーブルの幅（約300px）を考慮して重複を避ける間隔
   */
  TABLE_SPACING: 450,

  /**
   * 中央揃えのためのオフセット
   * @description 全体を画面中央に配置するためのX軸調整値
   * @unit ピクセル（px）
   * @value 500
   * @rationale ReactFlowキャンバスの中央付近に配置するための基準点
   */
  CENTER_OFFSET: 500,

  /**
   * 上部からの初期オフセット
   * @description 最上位階層テーブルのY軸開始位置
   * @unit ピクセル（px）
   * @value 100
   * @rationale ヘッダーやツールバーとの干渉を避けるための上部余白
   */
  VERTICAL_OFFSET: 100,
} as const;

/**
 * テーブル階層レベルの計算
 * @description エッジの関係から各テーブルの階層レベルをBFS探索で決定
 * @param tables 全テーブルデータ
 * @param edges エッジデータ
 * @returns テーブルIDと階層レベルのマップ
 */
function calculateTableLevels(tables: ParsedERTableData[], edges: Edge[]): Map<string, number> {
  const levels = new Map<string, number>();

  // 全テーブルを初期化（レベル0）
  tables.forEach((table) => {
    levels.set(table.id, 0);
  });

  // エッジを分析して階層を決定
  const hasIncomingEdge = new Set<string>();
  edges.forEach((edge) => {
    hasIncomingEdge.add(edge.target);
  });

  // ルートテーブル（他から参照されないテーブル）をレベル0に設定
  const rootTables = tables.filter((table) => !hasIncomingEdge.has(table.id));
  if (rootTables.length === 0 && tables.length > 0) {
    // 循環参照などでルートが特定できない場合は最初のテーブルをルートとする
    levels.set(tables[0].id, 0);
  }

  // BFSで階層を計算
  const queue: string[] = rootTables.map((table) => table.id);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentLevel = levels.get(current) || 0;

    // 現在のテーブルから出る全てのエッジを探す
    edges.forEach((edge) => {
      if (edge.source === current && !visited.has(edge.target)) {
        const newLevel = currentLevel + 1;
        const existingLevel = levels.get(edge.target) || 0;
        levels.set(edge.target, Math.max(existingLevel, newLevel));
        queue.push(edge.target);
      }
    });
  }

  return levels;
}

/**
 * レベル別テーブルグループの作成
 * @description 階層レベルごとにテーブルをグループ化
 * @param levels テーブルIDと階層レベルのマップ
 * @returns レベルごとのテーブルIDリスト
 */
function groupTablesByLevel(levels: Map<string, number>): Map<number, string[]> {
  const tablesByLevel = new Map<number, string[]>();

  levels.forEach((level, tableId) => {
    if (!tablesByLevel.has(level)) {
      tablesByLevel.set(level, []);
    }
    tablesByLevel.get(level)!.push(tableId);
  });

  return tablesByLevel;
}

/**
 * テーブル位置の計算
 * @description レベル別グループから各テーブルの座標を計算
 * @param tablesByLevel レベルごとのテーブルIDリスト
 * @returns テーブルIDと座標のマップ
 */
function calculateTablePositions(
  tablesByLevel: Map<number, string[]>,
  direction: GraphType = "TD"
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const maxLevel = Math.max(0, ...Array.from(tablesByLevel.keys()));
  const horizontal = direction === "LR" || direction === "RL";
  // 段は向きに沿って (TD なら上から下、LR なら左から右)、同じ段は中央揃えで並べる。
  // 横向きの時は、段の間にテーブルの横幅ぶん、並びの間に縦の間隔を使う
  const gaps = horizontal
    ? {
        levelGap: ER_LAYOUT_CONSTANTS.TABLE_SPACING,
        spacing: ER_LAYOUT_CONSTANTS.LEVEL_HEIGHT,
        start: ER_LAYOUT_CONSTANTS.VERTICAL_OFFSET,
        center: ER_LAYOUT_CONSTANTS.CENTER_OFFSET,
      }
    : {
        levelGap: ER_LAYOUT_CONSTANTS.LEVEL_HEIGHT,
        spacing: ER_LAYOUT_CONSTANTS.TABLE_SPACING,
        start: ER_LAYOUT_CONSTANTS.VERTICAL_OFFSET,
        center: ER_LAYOUT_CONSTANTS.CENTER_OFFSET,
      };

  tablesByLevel.forEach((tableIds, level) => {
    tableIds.forEach((tableId, index) => {
      positions.set(
        tableId,
        placeByDirection({ level, index, count: tableIds.length, maxLevel }, direction, gaps)
      );
    });
  });

  return positions;
}

/**
 * ParsedERTableDataをReactFlowのNode型に変換するヘルパー関数
 * flowchartのhandleImportMermaidと同じ設計パターン + 自動レイアウト機能
 */
export function convertParsedDataToNodes(
  parsedData: ParsedERTableData[],
  edges: Edge[],
  handlers: {
    onNameChange: (nodeId: string, newName: string) => void;
    onColumnsChange: (nodeId: string, newColumns: ERColumn[]) => void;
  },
  /** 取り込む図の向き。並べ方をこれに合わせる */
  direction: GraphType = "TD"
): Node<ERTableNodeProps>[] {
  /**
   * テーブルの階層構造を分析してレイアウトを決定
   * @description エッジの関係から各テーブルの階層レベルを計算し、適切な位置に配置
   * @example ルートテーブル（参照されないテーブル）はレベル0、それを参照するテーブルはレベル1...
   */
  const layoutTables = (
    tables: ParsedERTableData[],
    edges: Edge[]
  ): Map<string, { x: number; y: number }> => {
    const levels = calculateTableLevels(tables, edges);
    const tablesByLevel = groupTablesByLevel(levels);
    return calculateTablePositions(tablesByLevel, direction);
  };

  const positions = layoutTables(parsedData, edges);

  return parsedData.map((parsedNode) => ({
    id: parsedNode.id,
    type: "erTable",
    position: positions.get(parsedNode.id) || { x: 400, y: 80 }, // フォールバック位置
    data: {
      name: parsedNode.name,
      columns: parsedNode.columns,
      onNameChange: (newName: string) => handlers.onNameChange(parsedNode.id, newName),
      onColumnsChange: (newColumns: ERColumn[]) =>
        handlers.onColumnsChange(parsedNode.id, newColumns),
    },
  }));
}
