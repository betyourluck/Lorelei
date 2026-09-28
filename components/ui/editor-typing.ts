/**
 * エディタのフッタと上書きモードの純粋な芯。Kataribe の editorTyping.ts から写した。
 *
 * どちらも CodeMirror に依らないのでテストできる。上書きは黙って文字を壊しうる経路 —
 * サロゲートペアや結合文字を半分だけ消すと、エラーも警告も出ないまま本文が化ける。
 */

/**
 * 上書きで消す幅（UTF-16 の符号単位）。`0` なら消さない = 挿入と同じ振る舞い。
 *
 * - **行末では 0**（次の行を食わない）
 * - 消す単位は書記素クラスタ。呼び出し側は `findClusterBreak` の結果を渡す。
 *   ここはその結果が前に戻る/動かない異常値を弾く番人を兼ねる
 */
export function overwriteSpan(lineLength: number, offset: number, clusterEnd: number): number {
  if (offset >= lineLength) return 0;
  if (clusterEnd <= offset) return 0;
  return Math.min(clusterEnd, lineLength) - offset;
}

/**
 * フッタに出す文字数。**コードポイント数**で数える
 * （JS の `.length` は UTF-16 の符号単位なので、絵文字を 2 と数える）。
 */
export function countChars(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}
