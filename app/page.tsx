// server component なので、入口 (@/components/i18n) ではなく client component のファイルを直に読む (入口は react-i18next まで読み、
// 開発サーバーは使わない再エクスポートも評価して RSC で落ちる。本番の組み立ては捨てるので通っていた)
import { DocumentTitle } from "@/components/i18n/document-title";
import { FlowEditor } from "@/features/flowchart/flow-editor";

export default function Home() {
  return (
    <>
      <DocumentTitle titleKey="app.flowTitle" />
      <FlowEditor />
    </>
  );
}
