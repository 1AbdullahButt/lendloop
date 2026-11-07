import { ToolsBrowser } from "@/components/tools/ToolsBrowser";
import { PageBody } from "@/components/ui/PageHeader";

export const metadata = { title: "Browse tools · LendLoop" };

export default function ToolsPage() {
  return (
    <PageBody>
      <ToolsBrowser />
    </PageBody>
  );
}
