# Ecovis Mandanten Plattform

## Overview
Die Ecovis Mandanten Plattform ist eine Enterprise-Webanwendung für Steuerberater zur Verarbeitung von E-Commerce-Transaktionsdaten. Die Plattform ermöglicht die Umwandlung von Daten aus verschiedenen Zahlungsdienstleistern (PayPal, Stripe etc.) in DATEV-kompatible Exportformate.

## Aktuelle Version
- MVP Version 1.0
- Letzte Aktualisierung: Februar 2026

## Tech Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Shadcn/UI
- **Backend**: Express.js, Node.js
- **Transformation Service**: Python FastAPI mit Polars (läuft auf Port 5001)
- **Datenbank**: PostgreSQL mit Drizzle ORM
- **Authentifizierung**: Better Auth (Email/Password)
- **Dateispeicher**: Replit Object Storage

## Projektstruktur

```
/
├── client/src/
│   ├── components/        # Wiederverwendbare UI-Komponenten
│   │   ├── AppSidebar.tsx # Haupt-Navigation
│   │   ├── ThemeToggle.tsx# Dark/Light Mode Toggle
│   │   └── ui/            # Shadcn UI Komponenten
│   ├── hooks/             # React Hooks
│   │   ├── use-auth.ts    # Authentifizierung
│   │   ├── use-toast.ts   # Toast-Benachrichtigungen
│   │   └── use-upload.ts  # Datei-Upload
│   ├── lib/               # Utility-Funktionen
│   ├── pages/             # Seiten-Komponenten
│   │   ├── LandingPage.tsx       # Öffentliche Landing Page
│   │   ├── LoginPage.tsx         # Login/Registrierung
│   │   ├── DashboardPage.tsx     # Übersichts-Dashboard
│   │   ├── ProcessesPage.tsx     # Prozess-Übersicht (mit Löschfunktion)
│   │   ├── ProcessBuilderPage.tsx# Prozess-Erstellung und -Bearbeitung
│   │   ├── ProcessExecutePage.tsx# Monatliche Daten-Uploads
│   │   ├── ProcessHistoryPage.tsx# Übersicht ausgeführter Prozesse
│   │   ├── VorlagenPage.tsx      # Makros und Vorlagedateien (2 Tabs)
│   │   ├── MandantSettingsPage.tsx# Mandant-Einstellungen
│   │   ├── MandantenListPage.tsx # Mandanten-Verwaltung
│   │   └── UsersPage.tsx         # Benutzerverwaltung
│   └── App.tsx            # App-Einstiegspunkt mit Routing
├── server/
│   ├── db.ts              # Datenbankverbindung
│   ├── routes.ts          # API-Endpunkte
│   ├── storage.ts         # Datenbank-Operationen
│   ├── lib/
│   │   ├── auth.ts        # Better Auth Konfiguration
│   │   ├── auth-middleware.ts # Session-Validierung
│   │   └── oauth-providers.ts # OAuth 2.0 Provider Registry (Stripe, PayPal, Amazon, Shopify)
│   └── replit_integrations/
│       └── object_storage/# Dateispeicher
└── shared/
    ├── schema.ts          # Drizzle Schema & TypeScript Types
    └── schema/
        └── auth.ts        # Better Auth Tabellen (user, session, account, verification)
```

## Datenmodelle

### Mandanten
- id, name, mandantenNummer, beraterNummer, sachkontenLaenge, sachkontenRahmen, dashboardConfig (JSONB), ossBeteiligung (boolean), apiConnections (JSONB Array)
- dashboardConfig: Konfiguration der Dashboard-Anzeige pro Mandant
  - showRevenue: boolean (Umsatz-Karte aus Umsatz-Prozessen)
  - showPayments: boolean (Zahlungs-Karte aus Zahlungs-Prozessen)
  - showOpenPayments: boolean (Offene Zahlungen = Umsätze - Zahlungen)
  - showTransactions: boolean (Buchungen/Transaktionsanzahl)
  - showTotalRevenue: boolean (Gesamtumsatz anzeigen)
  - showRevenueByPlatform: boolean (Umsatz nach Plattform)
  - showRevenueByCountry: boolean (Umsatz nach Ländern)
  - showRevenueByCurrency: boolean (Umsatz nach Währungen)
  - showProcessExecutions: boolean (Ausgeführte Prozesse)
  - showProcessTodos: boolean (Prozess-Aufgaben)
  - Hinweis: viewMode (Monats-/Jahresansicht) wird lokal im Dashboard umgeschaltet, nicht in der Config gespeichert

### Prozesse
- id, mandantId, name, description, processType, inputFileCount, inputFileSlots (JSONB), transformationSteps, executionFrequency
- processType: "umsatz" | "zahlung" | "gutschein" (Standard: umsatz) - bestimmt ob der Prozess Umsätze, Zahlungen oder Gutscheine (Forderungen) verarbeitet. Gutscheine werden nicht in Umsatz/Zahlungs-Gegenrechnung berücksichtigt.
- inputFileSlots: Array von benannten Datei-Slots mit { id, name, description, required }
- executionFrequency: weekly | monthly | quarterly | yearly (Standard: monthly)
- countryColumn: Optionaler Spaltenname im Output-DataFrame für Länder-Auswertung (z.B. "land", "country")
- platformName: Optionaler Plattformname für Dashboard-Auswertung (z.B. "PayPal", "Stripe", "Shopify")
- apiConnectionId: Optionale Referenz auf eine verbundene API-Connection des Mandanten
- apiDataConfig: JSONB mit API-Datenquellen-Konfiguration { dataType, dateRange, variableName }

### Prozess-Ausführungen
- id, processId, mandantId, status, month, quarter, year, inputFiles, outputData, transactionCount
- countryBreakdown: JSONB mit Umsatz pro Land (z.B. {"DE": 1000, "AT": 500})
- currencyBreakdown: JSONB mit Umsatz pro Währung (aus wkz-Spalte, leer = EUR)
- platformBreakdown: JSONB mit Umsatz pro Plattform (aus platformName des Prozesses)
- month: Monat (1-12), bei weekly/monthly Ausführungen
- quarter: Quartal (1-4), bei quarterly Ausführungen
- year: Jahr (immer gesetzt)

### Export-Datensätze
- id, mandantId, processExecutionId, name, format (ascii/datev), exportData

### Benutzerprofile
- id, userId, role (internal/external)

### Mandant-Benutzer-Zuweisungen
- id, mandantId, userId

### Makros
- id, name, description, pythonCode, patternFiles (JSONB Array)
- patternFiles: Array von { id, name, variable, storagePath, originalFilename }

### Vorlagedateien (Template Files)
- id, name, description, storagePath, originalFilename, fileSize, mimeType, createdAt
- Global verfügbar für alle Prozesse über `pl.read_csv("vorlagen/dateiname")`

## API-Endpunkte

### Authentifizierung (Better Auth)
- `POST /api/auth/sign-up/email` - Registrierung mit Email/Passwort
- `POST /api/auth/sign-in/email` - Login mit Email/Passwort
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/session` - Session abrufen
- `GET /api/user` - Aktueller Benutzer mit Profil

### Mandanten
- `GET /api/mandanten` - Alle Mandate abrufen
- `POST /api/mandanten` - Neues Mandat erstellen
- `PATCH /api/mandanten/:id` - Mandat aktualisieren
- `DELETE /api/mandanten/:id` - Mandat löschen
- `GET /api/mandanten/:id/users` - Zugewiesene Benutzer
- `POST /api/mandanten/:id/users` - Benutzer zuweisen
- `DELETE /api/mandanten/:mandantId/users/:userId` - Zuweisung entfernen

### Prozesse
- `GET /api/processes` - Prozesse eines Mandanten
- `POST /api/processes` - Neuer Prozess
- `PATCH /api/processes/:id` - Prozess aktualisieren
- `DELETE /api/processes/:id` - Prozess löschen
- `POST /api/processes/:id/execute` - Prozess ausführen

### Prozess-Ausführungen
- `GET /api/process-executions` - Ausführungen abrufen
- `GET /api/process-executions/completed` - Abgeschlossene Ausführungen
- `GET /api/process-executions/recent` - Letzte Ausführungen

### Exporte
- `GET /api/exports` - Export-Verlauf
- `POST /api/exports` - Neuen Export erstellen
- `GET /api/exports/:id/download` - Export herunterladen

### OAuth 2.0 / API-Verbindungen
- `GET /api/oauth/providers` - Verfügbare OAuth-Provider mit Konfigurationsstatus
- `GET /api/mandanten/:id/oauth/:provider/start` - OAuth-Flow starten (Redirect zu Provider)
- `GET /api/oauth/callback/:provider` - OAuth-Callback (Token-Austausch)
- `DELETE /api/mandanten/:id/oauth/:connectionId/disconnect` - API-Verbindung trennen
- `GET /api/mandanten/:id/oauth/status` - Status aller API-Verbindungen eines Mandanten
- `POST /api/mandanten/:id/oauth/:connectionId/fetch-data` - API-Daten abrufen

### Benutzer
- `GET /api/users` - Alle Benutzer
- `PATCH /api/users/:id/role` - Benutzerrolle ändern

## OAuth 2.0 Integration

### Unterstützte Provider
- **Stripe Connect**: Zahlungen, Payment Intents, Auszahlungen, Rückerstattungen
- **PayPal**: Transaktionen, Zahlungen
- **Amazon SP-API**: Bestellungen, Abrechnungen
- **Shopify**: Bestellungen, Transaktionen (benötigt Shop-Domain)

### Architektur
- OAuth-Tokens werden ausschließlich serverseitig gespeichert (apiConnections JSONB in mandanten)
- Automatischer Token-Refresh vor API-Aufrufen
- State-Parameter für CSRF-Schutz
- Provider-Registry in `server/lib/oauth-providers.ts`
- API-Daten werden als CSV konvertiert und durch bestehende Python/Polars-Pipeline verarbeitet
- Environment Variables: `{PROVIDER}_CLIENT_ID` und `{PROVIDER}_CLIENT_SECRET` pro Provider

### API-Datenfluss
1. Prozess wird mit apiConnectionId + apiDataConfig konfiguriert
2. Bei Ausführung: Daten werden automatisch von der API abgerufen
3. API-Response wird zu CSV konvertiert
4. CSV wird als Variable `api_data` (Dateipfad) im Python-Code verfügbar
5. Bestehende Transformationslogik verarbeitet die Daten wie gewohnt

## Benutzerrollen

### Intern (Ecovis-KSO)
- Zugriff auf alle Mandate
- Benutzerverwaltung
- Kann Benutzer zu Mandaten zuweisen

### Extern (Mandanten)
- Nur Zugriff auf zugewiesene Mandate
- Keine Benutzerverwaltung

## Transformationsschritte (Toolbox)
- Spalte entfernen
- Spalte hinzufügen
- Spalte umbenennen
- Spalten zusammenführen
- Spalte aufteilen
- Text entfernen
- Dateien matchen
- Zeilen filtern

## Entwicklung

### Datenbank-Migration
```bash
npm run db:push
```

### Anwendung starten
```bash
npm run dev
```

## Export-Formate

### CSV Export
- Standard CSV-Export der transformierten Daten
- Delimiter konfigurierbar (Standard: Semikolon)

### DATEV Format
- CSV mit ";" als Delimiter
- Verwendet `pattern_datev` Vorlagedatei aus Vorlagen für Spalten-Mapping via `pl.concat(how='align')`
- Oberste Zeile enthält DATEV-Header: `DTVF;700;21;Buchungsstapel;12;;;;;;{beraternummer};{mandantennummer};{year}0101;{sachkontenlaenge};{year}{month}01;{year}{month}{days};{description};;1;0;0;EUR;;;;;{sachkontenrahmen}`
- `days` = maximale Tagesanzahl des Monats (Schaltjahre beachtet)
- Header-Zeile wird über Python-Service `/export-datev` Endpoint generiert
- Variablen aus Mandanteninformationen und Ausführungszeitraum

## Design-System
- Primärfarbe: Blau (#2563EB)
- Font: Inter
- Dark Mode unterstützt
- Responsive Design
