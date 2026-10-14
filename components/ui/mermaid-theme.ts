import type { DropCounter } from "./mermaid-dropped";
import type { DiagramConfigSnapshot } from "./mermaid-snapshot";

/**
 * Mermaid のテーマ (spec 24)。テーマは図の Mermaid の先頭に frontmatter で書いて持ち回る (D1・D2)。
 * 編集画面 (キャンバス) の見た目には使わない。出力 (コード生成・書き出し・プレビュー) にだけ効く
 */

/** 選べるテーマ (D3)。Mermaid の名前のまま */
export const MERMAID_THEMES = ["default", "neutral", "dark", "forest"] as const;

export type MermaidTheme = (typeof MERMAID_THEMES)[number];

export const isMermaidTheme = (value: unknown): value is MermaidTheme =>
  typeof value === "string" && (MERMAID_THEMES as readonly string[]).includes(value);

/**
 * 図の先頭に書く frontmatter。default の時は何も書かない (今までの出力をバイト単位で変えない, 受け入れ条件 6)
 */
export const themeFrontmatter = (theme: MermaidTheme | undefined): string =>
  !theme || theme === "default" ? "" : `---\nconfig:\n  theme: ${theme}\n---\n`;

/**
 * 書き出し・プレビューの背景 (D5)。dark は Mermaid のテーマの background (#333)、ほかは白 (今と同じ)
 */
export const themeBackground = (theme: MermaidTheme | undefined): string =>
  theme === "dark" ? "#333" : "white";

/**
 * 取り込み: 図の先頭の設定から、エディタが持つテーマを取り出す (spec 24 D1・D4)。
 * テーマ以外の設定 (`config:<名前>`) と選べないテーマ (`theme:<名前>`) は消えるものに数える (今までは黙って消えた)。
 * default はエディタでも持たない (向きの TD と同じ)
 */
export const themeFromConfig = (
  config: DiagramConfigSnapshot | undefined,
  drops: DropCounter
): MermaidTheme | undefined => {
  if (!config) return undefined;
  for (const key of config.keys) drops.add(`config:${key}`);
  if (config.theme === undefined) return undefined;
  if (!isMermaidTheme(config.theme)) {
    drops.add(`theme:${config.theme}`);
    return undefined;
  }
  return config.theme === "default" ? undefined : config.theme;
};
