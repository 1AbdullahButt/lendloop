import { MyListings } from "@/components/listings/MyListings";
import { PageBody, PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "My listings · LendLoop" };

export default function MyListingsPage() {
  return (
    <PageBody>
      <PageHeader title="My listings">
        Tools you lend. You decide every request, and only signed-in neighbors see who&apos;s lending.
      </PageHeader>
      <MyListings />
    </PageBody>
  );
}
