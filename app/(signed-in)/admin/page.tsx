import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Admin · LendLoop" };

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Admin">Moderate listings, manage Trusted Lender badges and watch automation.</PageHeader>
      <QueryBoundary>
        <AdminDashboard />
      </QueryBoundary>
    </>
  );
}
