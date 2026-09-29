import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test } from "vitest";
import { render, screen } from "../../../__tests__/test-utils";
import { ERTableNode } from "../components/node/er-table-node";

// spec 13 P4 で見つけた: 取り込んだテーブルの ID は名前そのもの。名前に " があると、xyflow の useUpdateNodeInternals が
// ID をそのまま CSS セレクタ ([data-id="…"]) に埋めて例外になり、アプリが落ちた (配布ビルドで開き直すと Application error)
describe("ERTableNode の ID", () => {
  test.each(['顧客 "VIP"', "a\\b"])("ID %s のテーブルも描ける", async (id) => {
    render(
      <ReactFlowProvider>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlow
            nodes={[
              {
                id,
                type: "erTable",
                position: { x: 0, y: 0 },
                data: { name: id, columns: [], onNameChange: () => {}, onColumnsChange: () => {} },
              },
            ]}
            nodeTypes={{ erTable: ERTableNode }}
          />
        </div>
      </ReactFlowProvider>
    );
    expect(await screen.findByDisplayValue(id)).toBeInTheDocument();
  });
});
