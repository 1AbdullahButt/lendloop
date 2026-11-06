import { MyRequests } from "@/components/loans/MyRequests";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "My requests · LendLoop" };

export default function MyRequestsPage() {
  return (
    <>
      <PageHeader title="My requests">What you asked to borrow, its status and recent notifications.</PageHeader>
      <MyRequests />
    </>
  );
}
