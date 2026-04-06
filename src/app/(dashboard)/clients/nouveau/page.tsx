import { ClientForm } from "@/components/clients/ClientForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function NouveauClientPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Clients
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Nouveau client</h1>
      </div>
      <ClientForm />
    </div>
  );
}
