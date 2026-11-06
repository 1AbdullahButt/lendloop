import { ToolsBrowser } from "@/components/tools/ToolsBrowser";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Tools · LendLoop" };

export default function ToolsPage() {
  return (
    <>
      <PageHeader title="Tools">Everything your neighbours lend. Pick dates and send a request.</PageHeader>
      <ToolsBrowser />
    </>
  );
}
