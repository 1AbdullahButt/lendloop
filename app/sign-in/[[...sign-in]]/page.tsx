import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Wordmark } from "@/components/ui/Logo";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="inline-flex min-h-11 items-center text-ink no-underline">
        <Wordmark size="lg" />
      </Link>
      <SignIn path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/tools" />
    </main>
  );
}
