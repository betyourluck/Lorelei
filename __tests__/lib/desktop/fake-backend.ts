// src-tauri の custom command をメモリ上で真似る (図の一覧, data_contract `GuiCommands`)。
import { vi } from "vitest";

type Doc = {
  id: string;
  title: string;
  editor: "flowchart" | "erDiagram";
  origin: "new" | "ai" | "import";
  source: string;
  layout: Record<string, { x: number; y: number }>;
  originalSource: string | null;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
};

export function fakeBackend() {
  let clock = 0;
  const now = () => `2026-09-24T12:00:${String(clock++).padStart(2, "0")}.000000+09:00`;
  const docs = new Map<string, Doc>();
  const trashed: string[] = [];
  let last: string | null = null;
  let n = 0;
  // src-tauri/src/documents.rs と同じ規則 (spec 02 D12)
  const orderKey = (d: Doc) => d.savedAt ?? d.createdAt;
  const summary = (d: Doc) => ({
    id: d.id,
    title: d.title,
    editor: d.editor,
    origin: d.origin,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    savedAt: d.savedAt,
    unsaved: d.updatedAt > orderKey(d),
  });

  const add = (editor: Doc["editor"], title?: string, extra: Partial<Doc> = {}): Doc => {
    const t = now();
    const d: Doc = {
      id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
      title: title ?? (editor === "flowchart" ? "無題のフローチャート" : "無題の ER 図"),
      editor,
      origin: "new",
      source: "",
      layout: {},
      originalSource: null,
      createdAt: t,
      updatedAt: t,
      savedAt: null,
      ...extra,
    };
    docs.set(d.id, d);
    return d;
  };

  // GUI の中の MCP の待ち受け (spec 03 P2)。src-tauri/src/mcp_host.rs の McpStatus と同じ形
  const mcp = {
    enabled: true,
    port: 39642,
    token: "0123456789abcdef0123456789abcdef" as string | null,
    state: "listening" as "listening" | "stopped" | "failed" | "blocked",
    detail: null as string | null,
  };

  const invoke = vi.fn(async (cmd: string, args: Record<string, unknown> = {}) => {
    switch (cmd) {
      case "mcp_status":
        return { ...mcp };
      case "set_mcp_enabled":
        mcp.enabled = args.enabled as boolean;
        mcp.state = mcp.enabled ? "listening" : "stopped";
        return { ...mcp };
      case "set_mcp_port":
        mcp.port = args.port as number;
        return { ...mcp };
      case "regenerate_mcp_token":
        mcp.token = "fedcba9876543210fedcba9876543210";
        return { ...mcp };
      case "list_documents":
        return Array.from(docs.values())
          .sort((a, b) => orderKey(b).localeCompare(orderKey(a)))
          .map(summary);
      case "create_document":
        return add(args.editor as Doc["editor"], (args.title as string) ?? undefined);
      case "load_document": {
        const d = docs.get(args.id as string);
        if (!d) throw new Error("not found");
        return d;
      }
      case "save_document": {
        const d = docs.get(args.id as string)!;
        const firstFill = d.source === "";
        Object.assign(d, { source: args.source, layout: args.layout });
        if (!firstFill) d.updatedAt = now();
        return summary(d);
      }
      case "mark_document_saved": {
        const d = docs.get(args.id as string)!;
        d.savedAt = now();
        return summary(d);
      }
      case "rename_document":
        docs.get(args.id as string)!.title = args.title as string;
        return undefined;
      case "trash_document":
        docs.delete(args.id as string);
        trashed.push(args.id as string);
        return undefined;
      case "last_opened":
        return last;
      case "set_last_opened":
        last = args.id as string;
        return undefined;
      case "take_pending_open":
        return [];
      case "convert_source":
        return { source: args.source, payload: null, dropped: [], error: "fake", document: null };
      default:
        return undefined;
    }
  });

  return {
    invoke,
    mcp,
    docs,
    trashed,
    add,
    setLast: (id: string | null) => {
      last = id;
    },
    calls: (cmd: string) => invoke.mock.calls.filter(([c]) => c === cmd).map(([, a]) => a),
  };
}
