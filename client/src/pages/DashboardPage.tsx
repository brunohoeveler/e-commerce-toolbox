import { Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface DashboardPageProps {
  mandantId: string | null;
}

export function DashboardPage({ mandantId }: DashboardPageProps) {
  if (!mandantId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Kein Mandat ausgewählt</h3>
            <p className="text-muted-foreground">
              Bitte wählen Sie ein Mandat aus der Seitenleiste, um das Dashboard anzuzeigen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Übersicht für das ausgewählte Mandat
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 text-center py-12">
          <p className="text-muted-foreground">
            Das Dashboard wird Schritt für Schritt mit Inhalten gefüllt.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
