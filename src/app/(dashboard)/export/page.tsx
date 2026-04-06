import { ExportClient } from "@/components/export/ExportClient";

export default function ExportPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Export comptable</h1>
        <p className="text-slate-500 mt-1">
          Exportez vos données pour votre expert-comptable ou votre logiciel de comptabilité
        </p>
      </div>
      <ExportClient />
    </div>
  );
}
