import type { Mermaid } from "mermaid";

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
export const renderMermaid = async (id: string, code: string): Promise<string> => {
  const mermaid = await loadMermaid();
  const { svg } = await mermaid.render(id, code);
  return svg;
};
