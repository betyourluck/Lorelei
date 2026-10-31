/**
 * WebView の既定の右クリックのメニュー (再読み込み・印刷・名前を付けて保存など) をデスクトップで出さない。
 * 文字を入れる所 (入力欄・テキスト欄・コードのエディタ) は、切り取り・コピー・貼り付けのメニューを残す
 */
import { afterEach, describe, expect, it } from "vitest";
import { blockBrowserContextMenu, keepsContextMenu } from "@/lib/desktop/context-menu";

const rightClick = (target: Element): boolean => {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  target.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("WebView の既定の右クリックのメニューを出さない", () => {
  let release: (() => void) | undefined;
  afterEach(() => {
    release?.();
    release = undefined;
    document.body.innerHTML = "";
  });

  it("画面の上 (キャンバス・ボタン・文字・チェックボックス) では既定のメニューを止める", () => {
    document.body.innerHTML = `
      <div id="pane"><span id="label">ノード</span></div>
      <button id="button">確定</button>
      <input id="check" type="checkbox" />
      <div contenteditable="false"><span id="readonly">読むだけのコード</span></div>`;
    release = blockBrowserContextMenu(document);
    for (const id of ["pane", "label", "button", "check", "readonly"])
      expect([id, rightClick(document.getElementById(id)!)]).toEqual([id, true]);
  });

  it("入力欄・テキスト欄・コードのエディタ (contenteditable) では既定のメニュー (切り取り・コピー・貼り付け) を残す", () => {
    document.body.innerHTML = `
      <input id="text" />
      <input id="number" type="number" />
      <textarea id="area"></textarea>
      <div class="cm-content" contenteditable="true"><div class="cm-line"><span id="code">flowchart TD</span></div></div>`;
    release = blockBrowserContextMenu(document);
    for (const id of ["text", "number", "area", "code"])
      expect([id, rightClick(document.getElementById(id)!)]).toEqual([id, false]);
  });

  it("外すと止めない", () => {
    document.body.innerHTML = `<div id="pane"></div>`;
    blockBrowserContextMenu(document)();
    expect(rightClick(document.getElementById("pane")!)).toBe(false);
  });

  it("文字を入れる所の判定", () => {
    document.body.innerHTML = `<input id="t" type="search" /><input id="r" type="radio" /><div id="d"></div>`;
    expect(keepsContextMenu(document.getElementById("t"))).toBe(true);
    expect(keepsContextMenu(document.getElementById("r"))).toBe(false);
    expect(keepsContextMenu(document.getElementById("d"))).toBe(false);
    expect(keepsContextMenu(null)).toBe(false);
  });
});
