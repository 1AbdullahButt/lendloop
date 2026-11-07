import { IncomingRequests } from "@/components/loans/IncomingRequests";
import { PageBody } from "@/components/ui/PageHeader";

export const metadata = { title: "Incoming requests · LendLoop" };

export default function IncomingPage() {
  return (
    <PageBody width="narrow">
      <IncomingRequests />
    </PageBody>
  );
}
