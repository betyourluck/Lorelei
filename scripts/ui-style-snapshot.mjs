/* global process, console, window, document, localStorage, getComputedStyle */
// 画面の見た目を場面ごとに記録する (spec 27 P0。ライトが前と同じか・dark の文字が読めるかを測る)。
//
//   node scripts/ui-style-snapshot.mjs <出力フォルダ> [--base http://localhost:3015] [--desktop] [--dark]
//   比べるのは scripts/ui-style-compare.mjs
//
// - Web 版の開発サーバー (.claude/launch.json の web-dev、next dev -p 3015) に、裏の Edge (headless・使い捨てのプロファイル・1280×800) でつなぐ
//   (Browser pane は隠れると描画が止まる, failures #41)
// - 場面ごとに、全部の要素の計算されたスタイル (<場面>.json)・文字のコントラスト (<場面>.contrast.json)・画素 (<場面>.png) を書く
// - --desktop: デスクトップの外枠 (lib/desktop) は isTauri() の時だけ描かれるので、偽の __TAURI_INTERNALS__ を差し込んで描かせる。
//   図はどれも中身が空 (= 初期図で開く)。インポートなど Rust の処理は動かない
// - --dark: yamada-ui の覚えた色モード (localStorage の ui-color-mode) を dark にして開く。xyflow の色はアプリが渡す colorMode に任せる
// - 同じコードで回した記録どうしの揺れ (2026-10-29): 計算されたスタイルは CodeMirror の行番号の位置の 0.1px だけ、
//   画素はキャンバスの場面で 0、ダイアログの場面で 1,200〜4,700 (spec 27「P0 結果」)
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--"));
const baseFlag = args.indexOf("--base");
const base = baseFlag >= 0 ? args[baseFlag + 1] : "http://localhost:3015";
const desktop = args.includes("--desktop");
const dark = args.includes("--dark");
if (!out) {
  console.error(
    "使い方: node scripts/ui-style-snapshot.mjs <出力フォルダ> [--base URL] [--desktop] [--dark]"
  );
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const FLOW = `flowchart TD
  A[開始] -->|はい| B{判定}
  B -->|いいえ| C[終了]
  subgraph S1[処理の枠]
    D[手順1] --> E[手順2]
  end
  C --> D
`;
const ER = `erDiagram
  USER ||--o{ ORDER : places
  USER {
    int id PK
    string name
  }
  ORDER {
    int id PK
    int user_id FK
  }
`;

const PROPS = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "box-shadow",
  "outline-color",
  "outline-width",
  "outline-style",
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "caret-color",
  "text-decoration-color",
  "color-scheme",
  "font-size",
  "font-weight",
  "visibility",
  "display",
];

/** 全部の要素の計算されたスタイルと位置・大きさ */
const dump = (page) =>
  page.evaluate((props) => {
    // 要素の DOM の道筋 (記録どうしで同じ要素を同じ名で呼ぶ)。script・style などは数えない
    // (Next が差し込む script の数が変わっても、後ろの要素の名が変わらないように)
    const counted = (e) => !["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "TEMPLATE"].includes(e.tagName);
    const path = (el) => {
      const parts = [];
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        const i = e.parentElement ? [...e.parentElement.children].filter(counted).indexOf(e) : 0;
        parts.push(`${e.tagName.toLowerCase()}[${i}]`);
      }
      return parts.reverse().join(">");
    };
    const rows = {};
    for (const el of [
      document.documentElement,
      ...document.documentElement.querySelectorAll("*"),
    ]) {
      if (el.closest("script,style,head")) continue;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const row = {
        rect: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(","),
      };
      for (const p of props) row[p] = s.getPropertyValue(p);
      if (el.matches("input,textarea"))
        row["::placeholder"] = getComputedStyle(el, "::placeholder").color;
      rows[path(el)] = row;
    }
    return rows;
  }, PROPS);

/**
 * 文字を直に持つ要素ごとに、文字の色と実際の背景 (祖先の背景を重ねた色) のコントラスト比。
 * CodeMirror と SVG の中 (Mermaid のプレビュー) は除く。要素の opacity・背景の画像は見ない (近似)
 */
const contrast = (page) =>
  page.evaluate(() => {
    // 要素の DOM の道筋 (記録どうしで同じ要素を同じ名で呼ぶ)。script・style などは数えない
    // (Next が差し込む script の数が変わっても、後ろの要素の名が変わらないように)
    const counted = (e) => !["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "TEMPLATE"].includes(e.tagName);
    const path = (el) => {
      const parts = [];
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        const i = e.parentElement ? [...e.parentElement.children].filter(counted).indexOf(e) : 0;
        parts.push(`${e.tagName.toLowerCase()}[${i}]`);
      }
      return parts.reverse().join(">");
    };
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [r, g, b, a];
    };
    const over = (top, bot) => {
      const a = top[3] + bot[3] * (1 - top[3]);
      return a === 0
        ? [0, 0, 0, 0]
        : [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a);
    };
    const effBg = (el) => {
      const chain = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0) chain.push(c);
        if (c && c[3] >= 1) break;
      }
      let acc = [255, 255, 255, 1];
      for (let i = chain.length - 1; i >= 0; i--) acc = over(chain[i], acc);
      return acc;
    };
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const rows = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest(".cm-editor, svg, script, style")) continue;
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join("");
      if (!own) continue;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || s.visibility !== "visible" || s.display === "none")
        continue;
      const bg = effBg(el);
      const fg = over(parse(s.color) ?? [0, 0, 0, 1], bg);
      const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      rows.push({
        path: path(el),
        text: own.slice(0, 24),
        ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100,
        color: s.color,
        bg: `rgb(${bg.slice(0, 3).map(Math.round).join(", ")})`,
      });
    }
    return rows;
  });

const settle = (page, ms = 900) => page.waitForTimeout(ms);

const typeIntoEditor = async (page, code) => {
  const cm = page.getByRole("dialog").locator(".cm-content");
  await cm.waitFor({ timeout: 60_000 });
  await cm.click();
  await page.keyboard.insertText(code);
};

let pendingImport = null;
const openImport = async (page, openLabel, code) => {
  await page.getByRole("button", { name: openLabel }).first().click();
  await typeIntoEditor(page, code);
  await page.getByRole("dialog").locator("svg").first().waitFor({ timeout: 60_000 });
  pendingImport = async () => {
    await page.getByRole("dialog").getByRole("button", { name: "インポート" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30_000 });
  };
};

const closeDialog = async (page) => {
  // CodeMirror にフォーカスがあると Esc は CodeMirror が受け取るので、ボタンで閉じられる時はボタンで
  const btn = page
    .getByRole("dialog")
    .getByRole("button", { name: /^(キャンセル|閉じる)$/ })
    .first();
  if (await btn.count()) await btn.click();
  else await page.keyboard.press("Escape");
  await page
    .getByRole("dialog")
    .waitFor({ state: "detached", timeout: 30_000 })
    .catch(() => {});
};

const openCodeDialog = async (page, label) => {
  await page.getByRole("button", { name: label }).first().click();
  await page.getByRole("dialog").locator("svg").first().waitFor({ timeout: 60_000 });
  await settle(page, 1500);
};

const WEB_SCENES = [
  [
    "flow-initial",
    async (page) => {
      await page.goto(`${base}/`, { timeout: 300_000 });
      await page.locator(".react-flow__node").first().waitFor({ timeout: 120_000 });
    },
  ],
  [
    "flow-import-dialog",
    async (page) => (await openImport(page, "インポート", FLOW), settle(page, 1500)),
  ],
  [
    "flow-imported",
    async (page) => {
      await pendingImport();
      await page.getByRole("button", { name: "fit view" }).click();
    },
  ],
  [
    "flow-arrow-menu",
    async (page) => {
      await page.getByRole("button", { name: "Select arrow type" }).first().click();
      await page.getByRole("menu").waitFor({ timeout: 10_000 });
    },
  ],
  [
    "flow-frame-menu",
    async (page) => {
      await page.keyboard.press("Escape");
      await settle(page, 400);
      await page
        .getByRole("button", { name: /枠の中の向き/ })
        .first()
        .click();
      await page.getByRole("menu").waitFor({ timeout: 10_000 });
    },
  ],
  [
    "flow-code-dialog",
    async (page) => {
      await page.keyboard.press("Escape");
      await settle(page, 400);
      await openCodeDialog(page, "コード生成");
    },
  ],
  [
    "flow-theme-menu",
    async (page) => {
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /default/ })
        .click();
      await page.getByRole("menu").waitFor({ timeout: 10_000 });
    },
  ],
  [
    "flow-delete-confirm",
    async (page) => {
      await page.keyboard.press("Escape");
      await settle(page, 300);
      await closeDialog(page);
      // 一番上のノードはパネルの裏に隠れることがあるので 2 つ目を押す
      await page
        .locator(".react-flow__node-editableNode")
        .nth(1)
        .click({ position: { x: 20, y: 40 } });
      await page.keyboard.press("Backspace");
      await page
        .getByRole("alertdialog")
        .or(page.getByRole("dialog"))
        .first()
        .waitFor({ timeout: 10_000 });
    },
  ],
  [
    "er-initial",
    async (page) => {
      await page.goto(`${base}/er-diagram/`, { timeout: 300_000 });
      await page.locator(".react-flow__node").first().waitFor({ timeout: 120_000 });
    },
  ],
  [
    "er-import-dialog",
    async (page) => (await openImport(page, "mermaidインポート", ER), settle(page, 1500)),
  ],
  [
    "er-imported",
    async (page) => {
      await pendingImport();
      await page.getByRole("button", { name: "fit view" }).click();
    },
  ],
  ["er-code-dialog", (page) => openCodeDialog(page, "mermaidコード出力")],
];

const DESKTOP_SCENES = [
  [
    "desk-initial",
    async (page) => {
      await page.goto(`${base}/`, { timeout: 300_000 });
      await page.locator(".react-flow__node").first().waitFor({ timeout: 120_000 });
      await page.getByText("会員テーブル").waitFor({ timeout: 30_000 });
      await settle(page, 1500);
    },
  ],
  [
    "desk-settings",
    async (page) => {
      await page.getByRole("button", { name: /MCP/ }).first().click();
      await page.getByRole("dialog").waitFor({ timeout: 10_000 });
    },
  ],
  ["desk-settings-json", (page) => page.getByRole("tab", { name: "JSON" }).click()],
  [
    "desk-import-dialog",
    async (page) => {
      await closeDialog(page);
      await page.getByRole("button", { name: "インポート" }).first().click();
      await typeIntoEditor(page, FLOW);
      await page.getByRole("dialog").locator("svg").first().waitFor({ timeout: 60_000 });
      await settle(page, 1500);
    },
  ],
  [
    "desk-code-dialog",
    async (page) => {
      await closeDialog(page);
      await openCodeDialog(page, "コード生成");
    },
  ],
];

/** 偽の Tauri (ブラウザの中で走る)。図の一覧 3 件・MCP は待ち受け中 */
const FAKE_TAURI = () => {
  const t = "2026-10-29T06:00:00Z";
  const docs = [
    {
      id: "d1",
      title: "受注の流れ",
      editor: "flowchart",
      origin: "ai",
      createdAt: t,
      updatedAt: t,
      savedAt: t,
      unsaved: false,
    },
    {
      id: "d2",
      title: "会員テーブル",
      editor: "erDiagram",
      origin: "import",
      createdAt: t,
      updatedAt: t,
      savedAt: null,
      unsaved: true,
    },
    {
      id: "d3",
      title: "新しい図",
      editor: "flowchart",
      origin: "new",
      createdAt: t,
      updatedAt: t,
      savedAt: t,
      unsaved: false,
    },
  ];
  const full = (id) => ({
    ...docs.find((d) => d.id === id),
    source: "",
    layout: {},
    originalSource: null,
  });
  const mcp = {
    enabled: true,
    port: 39642,
    token: "0123456789abcdef0123456789abcdef",
    state: "listening",
    detail: null,
  };
  let id = 1;
  const handlers = {
    list_documents: () => docs,
    last_opened: () => "d1",
    load_document: (a) => full(a.id),
    save_document: (a) => docs.find((d) => d.id === a.id),
    set_last_opened: () => null,
    take_pending_open: () => [],
    mcp_status: () => mcp,
    "plugin:event|listen": () => id++,
    "plugin:event|unlisten": () => null,
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    transformCallback: () => id++,
    unregisterCallback: () => {},
    invoke: async (cmd, a) => {
      if (cmd.startsWith("plugin:window|")) return null;
      const h = handlers[cmd];
      if (!h) throw new Error(`fake tauri: ${cmd}`);
      return h(a ?? {});
    },
  };
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: "light",
  reducedMotion: "reduce",
});
if (desktop) await context.addInitScript(FAKE_TAURI);
if (dark) await context.addInitScript(() => localStorage.setItem("ui-color-mode", "dark"));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const summary = [];
for (const [name, act] of desktop ? DESKTOP_SCENES : WEB_SCENES) {
  try {
    await act(page);
    await settle(page);
    // 文字の入力の点滅 (CodeMirror のカーソルなど) を止める
    await page.addStyleTag({
      content: "*{caret-color:transparent!important} .cm-cursor{display:none!important}",
    });
    const rows = await dump(page);
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(rows));
    const cs = await contrast(page);
    fs.writeFileSync(path.join(out, `${name}.contrast.json`), JSON.stringify(cs, null, 1));
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    const low = cs.filter((c) => c.ratio < 4.5).length;
    const bad = cs.filter((c) => c.ratio < 3).length;
    summary.push(
      `${name}\t${Object.keys(rows).length} 要素\t文字 ${cs.length}\t4.5 未満 ${low}\t3 未満 ${bad}`
    );
  } catch (e) {
    summary.push(`${name}\t失敗: ${String(e).split("\n")[0]}`);
  }
}
await browser.close();
fs.writeFileSync(
  path.join(out, "summary.txt"),
  [...summary, "", ...errors.map((e) => `pageerror: ${e}`)].join("\n")
);
console.log(summary.join("\n"));
if (errors.length) console.log(`pageerror ${errors.length} 件 (summary.txt)`);
if (summary.some((s) => s.includes("失敗"))) process.exitCode = 1;
