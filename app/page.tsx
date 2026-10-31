import { DocumentTitle } from "@/components/i18n";
import { FlowEditor } from "@/features/flowchart/flow-editor";

export default function Home() {
  return (
    <>
      <DocumentTitle titleKey="app.flowTitle" />
      <FlowEditor />
    </>
  );
}
