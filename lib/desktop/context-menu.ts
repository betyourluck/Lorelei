// WebView の既定の右クリックのメニューをデスクトップで出さない。WebView2 のメニューには「再読み込み」「印刷」
// 「名前を付けて保存」などがあり、アプリの画面を読み込み直したり、画面そのものを保存・印刷したりできてしまう。
// Tauri 2 は WebView2 の既定のメニューを止める設定 (wry の with_default_context_menus) を出しておらず、それも Windows だけなので、
// 画面の側で全部の OS に効く形で止める。文字を入れる所は、切り取り・コピー・貼り付けのメニューを残す (そこには再読み込みなどは出ない)

/** 文字を入れる input の種類 (チェックボックス・ボタンなどは止める) */
const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "url",
  "email",
  "password",
  "tel",
  "number",
]);

/** 既定のメニューを残す所: 文字を入れる input・textarea・編集できる contenteditable (CodeMirror の .cm-content) */
export const keepsContextMenu = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  const input = target.closest("input");
  if (input) return TEXT_INPUT_TYPES.has(input.getAttribute("type")?.toLowerCase() ?? "");
  if (target.closest("textarea")) return true;
  const editable = target.closest("[contenteditable]");
  return !!editable && editable.getAttribute("contenteditable") !== "false";
};

/** 既定の右クリックのメニューを止める。戻り値で外す */
export const blockBrowserContextMenu = (doc: Document = document): (() => void) => {
  const onContextMenu = (e: MouseEvent) => {
    if (!keepsContextMenu(e.target)) e.preventDefault();
  };
  doc.addEventListener("contextmenu", onContextMenu);
  return () => doc.removeEventListener("contextmenu", onContextMenu);
};
