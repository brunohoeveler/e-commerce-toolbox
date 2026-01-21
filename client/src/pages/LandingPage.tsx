import { ArrowRight, Shield, Zap, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: FileSpreadsheet,
    title: "Flexible Datentransformation",
    description: "Wandeln Sie CSV, Excel und TXT Dateien von PayPal, Stripe und anderen Zahlungsdienstleistern in DATEV-kompatible Formate um.",
  },
  {
    icon: Zap,
    title: "Automatisierte Prozesse",
    description: "Erstellen Sie wiederverwendbare Transformationsprozesse und führen Sie diese mit einem Klick für jeden Monat aus.",
  },
  {
    icon: Shield,
    title: "Sichere Mandantentrennung",
    description: "Vollständige Datenisolierung zwischen Mandanten mit rollenbasierter Zugriffskontrolle für interne und externe Nutzer.",
  },
];

const benefits = [
  "DATEV-konforme Exporte",
  "Multi-Mandanten-Verwaltung",
  "Spaltenoperationen & Matching",
  "Prozess-Vorlagen speichern",
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                <FileSpreadsheet className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
            <Button asChild data-testid="button-login-nav">
              <a href="/api/login">Anmelden</a>
            </Button>
          </div>
        </div>
      </nav>
      <main className="pt-16">
        <section className="relative overflow-hidden py-24 sm:py-32">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                    E-Commerce Daten
                    <span className="block text-primary">für DATEV optimiert</span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-xl">
                    Die professionelle Plattform für Steuerberater zur Verarbeitung von Transaktionsdaten aus PayPal, Stripe und anderen E-Commerce-Systemen. Transformieren Sie Ihre Mandantendaten effizient in DATEV-kompatible Formate.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" asChild data-testid="button-get-started">
                    <a href="/api/login">
                      Jetzt starten
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                  <Button size="lg" variant="outline" data-testid="button-learn-more">
                    Mehr erfahren
                  </Button>
                </div>

                <div className="flex flex-wrap gap-4 pt-4">
                  {benefits.map((benefit) => (
                    <div key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="relative rounded-lg border border-border bg-card p-6 shadow-lg">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-4">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-destructive" />
                        <div className="h-3 w-3 rounded-full bg-chart-3" />
                        <div className="h-3 w-3 rounded-full bg-chart-2" />
                      </div>
                      <span className="text-xs text-muted-foreground">Prozess-Toolbox</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                          <FileSpreadsheet className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">PayPal_Export_Jan.csv</div>
                          <div className="text-xs text-muted-foreground">2.847 Transaktionen</div>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-chart-2" />
                      </div>
                      <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                        <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                          <FileSpreadsheet className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">Stripe_Umsaetze_Jan.xlsx</div>
                          <div className="text-xs text-muted-foreground">1.253 Transaktionen</div>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-chart-2" />
                      </div>
                      <div className="mt-4 rounded-md border border-dashed border-primary/50 bg-primary/5 p-4 text-center">
                        <p className="text-sm text-primary font-medium">DATEV-Export bereit</p>
                        <p className="text-xs text-muted-foreground mt-1">4.100 Buchungssätze generiert</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="font-serif text-3xl sm:text-4xl font-bold mb-4">
                Leistungsstarke Funktionen
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Alle Werkzeuge, die Sie für die effiziente Verarbeitung von E-Commerce-Daten benötigen
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {features.map((feature) => (
                <Card key={feature.title} className="hover-elevate transition-all duration-300">
                  <CardContent className="pt-6">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold mb-4">
              Bereit für effizientere Mandantenbetreuung?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Starten Sie noch heute und transformieren Sie die Art, wie Sie E-Commerce-Daten für DATEV aufbereiten.
            </p>
            <Button size="lg" asChild data-testid="button-cta-bottom">
              <a href="/api/login">
                Kostenlos starten
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
                <FileSpreadsheet className="h-3 w-3 text-primary-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">
                Ecovis Mandanten Plattform
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Ecovis. Alle Rechte vorbehalten.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
