import { ExportClient } from "@/components/export/ExportClient";

export default function ExportPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">Export comptable</h1>
        <p className="text-brand-ink-muted mt-1">
          Exportez vos données pour votre expert-comptable ou votre logiciel de comptabilité
        </p>
      </div>
      <ExportClient />
    </div>
  );
}
