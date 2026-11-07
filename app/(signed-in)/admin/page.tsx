import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Admin · LendLoop" };

export default function AdminPage() {
  return (
    <PageBody gap="gap-8">
      <PageHeader title="Admin">
        Every loan, every listing and every automated email. The server checks your admin role on each action here,
        not just this page.
      </PageHeader>
      <QueryBoundary>
        <AdminDashboard />
      </QueryBoundary>
    </PageBody>
  );
}
