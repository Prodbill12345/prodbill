import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">ProdBill</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Créer votre espace société
          </p>
        </div>
        <SignUp
          appearance={{
            elements: {
              card: "shadow-lg border border-slate-200",
            },
          }}
        />
      </div>
    </div>
  );
}
