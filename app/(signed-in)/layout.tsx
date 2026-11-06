import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { AppNav } from "@/components/AppNav";
import { EnsureUser } from "@/components/EnsureUser";
import { QueryBoundary } from "@/components/ui/QueryBoundary";

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            LendLoop
          </Link>
          <UserButton />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <EnsureUser>
          <div className="mb-6">
            <QueryBoundary>
              <AppNav />
            </QueryBoundary>
          </div>
          <main>{children}</main>
        </EnsureUser>
      </div>
    </div>
  );
}
