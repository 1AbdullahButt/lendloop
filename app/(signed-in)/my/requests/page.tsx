import { MyRequests } from "@/components/loans/MyRequests";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "My requests · LendLoop" };

export default function MyRequestsPage() {
  return (
    <PageBody width="narrow">
      <PageHeader title="My requests">
        Everything you&apos;ve asked to borrow, with every email we&apos;ve sent about it, including the ones that
        failed.
      </PageHeader>
      <MyRequests />
    </PageBody>
  );
}
