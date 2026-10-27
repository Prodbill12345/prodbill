import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/brand/Logo";
import { Mascot } from "@/components/brand/Mascot";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Mascot size={96} className="mx-auto mb-5" />
          <h1 className="flex justify-center">
            <Logo className="scale-[1.6] origin-center" />
          </h1>
          <p className="text-brand-ink-muted mt-4 text-sm">
            Facturation audiovisuelle professionnelle
          </p>
        </div>
        <SignIn
          appearance={{
            elements: {
              card: "shadow-none border border-brand-rule rounded-[var(--radius-card)]",
              headerTitle: "text-brand-ink",
            },
          }}
        />
      </div>
    </div>
  );
}
