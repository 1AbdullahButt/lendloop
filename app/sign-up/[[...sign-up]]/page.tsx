import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Wordmark } from "@/components/ui/Logo";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="inline-flex min-h-11 items-center text-ink no-underline">
        <Wordmark size="lg" />
      </Link>
      <SignUp path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/tools" />
    </main>
  );
}
