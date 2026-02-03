import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LandingPage } from "@/pages/LandingPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ProcessesPage } from "@/pages/ProcessesPage";
import { ProcessBuilderPage } from "@/pages/ProcessBuilderPage";
import { ProcessExecutePage } from "@/pages/ProcessExecutePage";
import { MacrosPage } from "@/pages/MacrosPage";
import { MandantSettingsPage } from "@/pages/MandantSettingsPage";
import { MandantenListPage } from "@/pages/MandantenListPage";
import { UsersPage } from "@/pages/UsersPage";
import NotFound from "@/pages/not-found";
import type { Mandant } from "@shared/schema";

function AuthenticatedApp() {
  const [, navigate] = useLocation();
  const [selectedMandant, setSelectedMandant] = useState<Mandant | null>(null);

  const { data: mandanten } = useQuery<Mandant[]>({
    queryKey: ["/api/mandanten"],
  });

  useEffect(() => {
    if (mandanten && mandanten.length > 0 && !selectedMandant) {
      setSelectedMandant(mandanten[0]);
    }
  }, [mandanten, selectedMandant]);

  const handleSelectMandant = (mandant: Mandant) => {
    setSelectedMandant(mandant);
    navigate("/dashboard");
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          mandanten={mandanten || []}
          selectedMandant={selectedMandant}
          onSelectMandant={handleSelectMandant}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/" component={() => <DashboardPage mandantId={selectedMandant?.id || null} />} />
              <Route path="/dashboard" component={() => <DashboardPage mandantId={selectedMandant?.id || null} />} />
              <Route path="/processes" component={() => <ProcessesPage mandantId={selectedMandant?.id || null} />} />
              <Route path="/processes/new" component={() => <ProcessBuilderPage mandantId={selectedMandant?.id || null} />} />
              <Route path="/processes/:id/edit" component={({ params }) => <ProcessBuilderPage mandantId={selectedMandant?.id || null} processId={params.id} />} />
              <Route path="/processes/:id/execute" component={({ params }) => <ProcessExecutePage mandantId={selectedMandant?.id || null} processId={params.id} />} />
              <Route path="/macros" component={MacrosPage} />
              <Route path="/settings" component={() => <MandantSettingsPage mandantId={selectedMandant?.id || null} mandant={selectedMandant} />} />
              <Route path="/mandanten" component={() => <MandantenListPage onSelectMandant={handleSelectMandant} />} />
              <Route path="/users" component={UsersPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
