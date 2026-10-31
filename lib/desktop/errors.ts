// Rust が画面に渡すエラー (spec 34 D3、data_contract DesktopError)。Tauri の境界 (コマンドの Err・OpenRequest.error・McpStatus.detail) でこの形になる。
// 読み手は今の文字列 (頭に印の付いた文) も読む — 読み手を先に入れ、Rust の形を後から変えても間で見分けが外れないように (spec 34 P2)
import { i18n } from "@/components/i18n/i18n";
import { desktopT } from "./i18n";

export interface DesktopError {
  code: string;
  params?: Record<string, string | number> | null;
  /** 訳さない詳しい文 (io・serde・merman・lorelei_core の文) */
  detail?: string | null;
}

/** 文字列のエラーの頭の印 (Rust の形を変える前の documents.rs の文) */
const LEGACY = /^(STALE_BASE|DOCUMENT_GONE|INITIAL_FIGURE_REJECTED)(?::\s*([\s\S]*))?$/;

/** エラーを DesktopError として読む。読めなければ null (ただの文字列・Error) */
export const readError = (e: unknown): DesktopError | null => {
  if (e && typeof e === "object" && typeof (e as DesktopError).code === "string")
    return e as DesktopError;
  if (typeof e !== "string") return null;
  const m = LEGACY.exec(e);
  if (!m) return null;
  return m[1] === "STALE_BASE"
    ? { code: m[1], params: { currentUpdatedAt: (m[2] ?? "").split(/\s/)[0] } }
    : { code: m[1], detail: m[2] ?? null };
};

/** 見分ける名 (無ければ null) */
export const errorCode = (e: unknown): string | null => readError(e)?.code ?? null;

/**
 * 画面に出す文。呼ばれた時の言語で code を訳し、詳しい文があれば後ろに付ける。
 * code の無い文字列・知らない code は、題だけを訳す側に任せて文はそのまま返す
 */
export const describeError = (e: unknown): string => {
  const err = readError(e);
  if (!err) return e instanceof Error ? e.message : String(e ?? "");
  if (err.code === "OTHER") return err.detail ?? "";
  const key = `error.${err.code}`;
  if (!i18n.exists(key, { ns: "desktop" })) return err.detail ?? err.code;
  const message = (desktopT as (k: string, o?: object) => string)(key, err.params ?? {});
  return err.detail ? desktopT("error.withDetail", { message, detail: err.detail }) : message;
};
