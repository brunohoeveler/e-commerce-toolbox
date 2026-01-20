import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Settings,
  Download,
  FileText,
  Plus,
  Building2,
  Users,
  ChevronDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import type { Mandant } from "@shared/schema";

interface AppSidebarProps {
  mandanten: Mandant[];
  selectedMandant: Mandant | null;
  onSelectMandant: (mandant: Mandant) => void;
}

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Prozesse",
    url: "/processes",
    icon: FileText,
  },
  {
    title: "Neuer Prozess",
    url: "/processes/new",
    icon: Plus,
  },
  {
    title: "Exporte",
    url: "/exports",
    icon: Download,
  },
  {
    title: "Mandanteninformationen",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar({ mandanten, selectedMandant, onSelectMandant }: AppSidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Ecovis</span>
            <span className="text-xs text-muted-foreground">Mandanten Plattform</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-xs font-medium text-muted-foreground">
            Aktives Mandat
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center justify-between rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm hover-elevate"
                  data-testid="dropdown-mandant-select"
                >
                  <span className="truncate">
                    {selectedMandant ? selectedMandant.name : "Mandat wählen"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {mandanten.map((mandant) => (
                  <DropdownMenuItem
                    key={mandant.id}
                    onClick={() => onSelectMandant(mandant)}
                    data-testid={`menu-item-mandant-${mandant.id}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{mandant.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Nr. {mandant.mandantenNummer}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
                {mandanten.length === 0 && (
                  <DropdownMenuItem disabled>
                    Keine Mandate verfügbar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-4">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url) && item.url !== "/processes/new");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.url.replace(/\//g, "-").slice(1)}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-4">Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/mandanten"}
                  data-testid="nav-mandanten"
                >
                  <Link href="/mandanten">
                    <Building2 className="h-4 w-4" />
                    <span>Alle Mandate</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/users"}
                  data-testid="nav-users"
                >
                  <Link href="/users">
                    <Users className="h-4 w-4" />
                    <span>Benutzerverwaltung</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-3 rounded-md p-2 hover-elevate"
              data-testid="button-user-menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback>
                  {user?.firstName?.[0] || user?.email?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col text-left">
                <span className="text-sm font-medium">
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-32">
                  {user?.email}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              onClick={() => logout()}
              data-testid="button-logout"
            >
              Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
