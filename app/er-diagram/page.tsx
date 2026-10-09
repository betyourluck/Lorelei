import { ERDiagramEditor } from "@/features/er-diagram/er-diagram-editor";

export const metadata = {
  // フォークで Web 版を配る時は、ビルド時の NEXT_PUBLIC_SITE_TITLE を後ろに付ける (app/layout.tsx と同じ)
  title: process.env.NEXT_PUBLIC_SITE_TITLE
    ? `ER 図 — ${process.env.NEXT_PUBLIC_SITE_TITLE}`
    : "Mermmaid ER図エディター",
  description: "ER図を編集・可視化する",
};

export default function ERDiagramPage() {
  return <ERDiagramEditor />;
}
