# Ecovis Mandanten Plattform

## Overview
Die Ecovis Mandanten Plattform ist eine Enterprise-Webanwendung für Steuerberater zur Verarbeitung von E-Commerce-Transaktionsdaten. Die Plattform ermöglicht die Umwandlung von Daten aus verschiedenen Zahlungsdienstleistern (PayPal, Stripe etc.) in DATEV-kompatible Exportformate.

## Aktuelle Version
- MVP Version 1.0
- Letzte Aktualisierung: Januar 2024

## Tech Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Shadcn/UI
- **Backend**: Express.js, Node.js
- **Transformation Service**: Python FastAPI mit Polars (läuft auf Port 5001)
- **Datenbank**: PostgreSQL mit Drizzle ORM
- **Authentifizierung**: Replit Auth (OpenID Connect)
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
│   └── replit_integrations/
│       ├── auth/          # Authentifizierung
│       └── object_storage/# Dateispeicher
└── shared/
    ├── schema.ts          # Drizzle Schema & TypeScript Types
    └── models/auth.ts     # Auth-spezifische Modelle
```

## Datenmodelle

### Mandanten
- id, name, mandantenNummer, beraterNummer, sachkontenLaenge, sachkontenRahmen

### Prozesse
- id, mandantId, name, description, inputFileCount, inputFileSlots (JSONB), transformationSteps
- inputFileSlots: Array von benannten Datei-Slots mit { id, name, description, required }

### Prozess-Ausführungen
- id, processId, mandantId, status, month, year, inputFiles, outputData, transactionCount

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

### Authentifizierung
- `GET /api/login` - Login starten
- `GET /api/logout` - Logout
- `GET /api/auth/user` - Aktueller Benutzer

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

### Benutzer
- `GET /api/users` - Alle Benutzer
- `PATCH /api/users/:id/role` - Benutzerrolle ändern

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

## Design-System
- Primärfarbe: Blau (#2563EB)
- Font: Inter
- Dark Mode unterstützt
- Responsive Design
