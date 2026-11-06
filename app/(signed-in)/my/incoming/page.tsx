import { IncomingRequests } from "@/components/loans/IncomingRequests";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Incoming · LendLoop" };

export default function IncomingPage() {
  return (
    <>
      <PageHeader title="Incoming requests">Approve or decline requests on your tools, and mark loans returned.</PageHeader>
      <IncomingRequests />
    </>
  );
}
