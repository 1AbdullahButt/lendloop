import { MyListings } from "@/components/listings/MyListings";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "My listings · LendLoop" };

export default function MyListingsPage() {
  return (
    <>
      <PageHeader title="My listings">Add, edit or remove your tools and answer requests on them.</PageHeader>
      <MyListings />
    </>
  );
}
