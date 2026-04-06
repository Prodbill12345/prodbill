import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export const metadata = {
  title: "Configurer votre société — ProdBill",
};

export default async function OnboardingPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  // Si l'utilisateur a déjà un profil, renvoyer au dashboard
  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) redirect("/");

  // Récupérer le prénom depuis Clerk pour personnaliser l'accueil
  const clerkUser = await currentUser();
  const userName =
    clerkUser?.firstName ||
    clerkUser?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "là";

  return <OnboardingForm userName={userName} />;
}
