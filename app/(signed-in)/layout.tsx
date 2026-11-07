import { SignedInShell } from "@/components/SignedInShell";

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <SignedInShell>{children}</SignedInShell>
    </div>
  );
}
