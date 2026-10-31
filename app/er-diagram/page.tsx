import { DocumentTitle } from "@/components/i18n";
import { ERDiagramEditor } from "@/features/er-diagram/er-diagram-editor";

export const metadata = {
  // フォークで Web 版を配る時は、ビルド時の NEXT_PUBLIC_SITE_TITLE を後ろに付ける (app/layout.tsx と同じ)
  title: process.env.NEXT_PUBLIC_SITE_TITLE
    ? `ER 図 — ${process.env.NEXT_PUBLIC_SITE_TITLE}` // i18n-allow: 組み立ての時の題 (差し替えた題は切り替えても変えない)
    : "Mermmaid ER図エディター", // i18n-allow: 組み立ての時の題 (切り替えた時は DocumentTitle)
  description: "ER図を編集・可視化する", // i18n-allow: 組み立ての時の説明
};

export default function ERDiagramPage() {
  return (
    <>
      <DocumentTitle titleKey="app.erTitle" />
      <ERDiagramEditor />
    </>
  );
}
