# 🌴 Safr (Goa Guide Buddy) — AI Travel Safety Companion

## 📖 Overview

**Safr** is an intelligent, full-stack travel safety companion web application engineered to solve real-world tourism and security challenges across India, currently piloted in Goa. 

Traditional tourism apps only recommend places to visit; **Safr** actively protects travelers by combining **real-time geospatial safety scoring**, **turn-by-turn navigation with 1-tap Google Maps GPS**, **marine beach swell flags**, **crowd density intelligence**, **smart transport mode recommendations**, **budget-enforcing AI itinerary planning**, **Zero-Knowledge family QR safety wristbands with age-validation checks**, **live location sharing & buddy tracking**, **atomic trip and companion management**, **public emergency directory access**, and **multi-lingual accessibility** in 12+ Indian languages including Konkani.

---

## 🌟 Core Application Modules & Features

### 1. 🧭 Safe-Scored Wayfinding & Vector Navigation (`/map`)
* **Vector Basemap Engine (MapLibre GL v6)**: Ultra-smooth client-side vector map powered by OpenFreeMap styles (*Liberty*, *Positron*, *Dark*), with 3D building extrusions, AWS Terrarium DEM terrain hillshading, and automated fallback to OpenStreetMap raster tiles if vector sources are unreachable.
* **Dual Routing Engine (Valhalla + OSRM Failover)**:
  * **Valhalla Engine (Primary)**: Supports 4 travel modes — `car`, `motor_scooter`, `bicycle`, and `walking` — with polyline6 decoding and OpenStreetMap way IDs matching Overpass road segments.
  * **OSRM Fallback**: Automatic failover if Valhalla is busy or offline, ensuring uninterrupted routing for travelers.
* **Multi-Stop Waypoints (Up to 5 Stops)**: Add, reorder (drag or up/down), and delete intermediate waypoints with instant route recalculation, distance matrices, and estimated travel times.
* **Night-Travel Guidance Mode**: Automatically activates during Goa night hours (before 06:30 or after 18:45 IST), penalizing unlit highway stretches, unclassified roads, and ghat hairpin bends.
* **Route Comparison & Safety Scoring**: Evaluates candidate routes to surface fastest, shortest, and safest alternatives with road lighting notes, surface conditions, and police/hospital proximity alerts.
* **Turn-by-Turn Maneuver Drawer**: Step-by-step directions with maneuver icons, street names, active step markers, and split polylines (traveled vs. remaining).
* **Clustered Saved Places Overlay**: Visual cluster layer of bookmarked places directly on the map with 1-tap actions: "📍 Set as destination" or "➕ Add as stop".
* **1-Tap GPS Launch**: Deep-links directly into native Google Maps or Apple Maps turn-by-turn GPS navigation.

### 2. 🌊 Live Goa Weather & Marine Swell Station (`/dashboard`)
* **Real-Time Panjim Weather**: Hourly precipitation radar, humidity, wind speeds, and UV index powered by Open-Meteo.
* **Drishti Marine Lifeguard Swimming Flags**:
  * 🟢 **Green (Safe)**: Calm sea, recreational swimming allowed in patrol zones.
  * 🟡 **Yellow (Caution)**: Moderate swell, keep children and inexperienced swimmers near shore.
  * 🔴 **Red (Danger)**: High tide swell, dangerous rip currents — strictly no swimming.
* **Strict Sensor Data Validation**: Prevents partial or null weather sensor responses from appearing as zero temperatures, zero rain probabilities, or clear skies.

### 3. 🌴 Place Explorer, Transit Advisor & Bucket List (`/explore`)
* **Visual POI Cards**: Categorized by vibe (*Beaches*, *Monuments*, *Nightlife*, *Cafes*, *Nature*, *Heritage*, *Shopping*).
* **AI Crowd Density Gauge & Crowdsourced Reporting**: Real-time crowd meter (*quiet*, *moderate*, *busy*, *packed*) with recommended visiting times, quieter nearby alternatives, and 6-hour rate-limited crowd reports.
* **Wikipedia Landmark Knowledge & Photo Match**: Automatically matches Goa landmarks to Wikipedia summaries with clean sentence boundary trimming and verified image thumbnails.
* **Best Mode of Transport Advisor**: Tailored recommendations for Scooters (narrow alleys), 4x4 Jeeps (Dudhsagar safari), Ro-Ro Ferries, or Walking.
* **Opening Hours Engine**: Live evaluation of operating hours against Goa local time (`isOpen`, closing soon notices).
* **Saved Places Wishlist (❤️)**: 1-Tap bookmarking persisted to the Supabase database with optimistic UI updates.

### 4. ✨ Budget-Enforcing AI Itinerary Planner (`/itinerary`)
* **Time-Budgeted Optimization**: Schedules strictly within 1–24 hour budgets using real driving matrices, realistic visit durations, arrival buffers, and optional return trips.
* **Grounded AI Selection**: Google Gemini 2.5 Flash via `@ai-sdk/google` (Vercel AI SDK `ai` v7) ranks candidate OpenStreetMap places with structured schema validation (cannot fabricate times or coordinates).
* **Algorithmic Fallback Guarantee**: Built-in deterministic fallback produces a complete, realistic schedule even if AI services are rate-limited or offline.
* **Print & Export Support**: Dedicated print stylesheet optimized for PDF export and offline viewing.

### 5. 🏷️ Zero-Knowledge Family SafeTag Wristbands (`/safety-tags`, `/find`, `/t.$token`)
* **Printable QR Wristbands**: Water-resistant labels with cryptographically random tokens for children, adults, and seniors.
* **Strict Age Category Validation**: Validates ages and rejects mismatches (Kid: 0–17, Adult: 18–59, Senior: 60–120) with E.164 phone normalization (+91).
* **Zero-Knowledge Privacy Architecture**: Good Samaritans or finders can scan or visit `/find` to send instant geolocation alerts to guardians without seeing guardian phone numbers or hotel locations.
* **Multi-Channel Notification Pipeline**: WhatsApp and SMS alerts via Twilio, with secure input sanitization, rate-limiting (5 alerts / 10 min per IP/code), and honest delivery tracking (mock mode never simulates delivery as delivered).

### 6. 📍 Live Buddy Tracking & Family Reunite (`/live-tracking`)
* **Real-Time Geolocation Sharing**: Live location sharing on MapLibre GL map with individual member markers and accuracy circles.
* **Secure Tokenized Links**: Location sharing via cryptographic tokens (`location_links` / `location_links_safe` view) respecting Row-Level Security.
* **Meeting Point Coordination**: Coordinate family meeting spots and monitor reunion progress in crowded Goa areas.

### 7. 🚨 Public Verified Emergency Directory (`/emergency`)
* **100% Public Access**: Fully accessible without login during urgent crises.
* **Verified Official Contacts**: Goa Police (100 / 112), Ambulance (108), Fire (101), Pink Force, Drishti Marine Lifeguards (+91 832 252 0717), Goa Tourist Police (+91 832 242 8383), GMC Hospital Bambolim (+91 832 249 5000), Women Helpline (1091), Child Helpline (1098).
* **1-Tap Direct Call**: Immediate dialer triggers and emergency hospital locator.

### 8. 🌐 Konkani & Multi-Language Indian Translator
* **Universal Accessibility**: Whole-page translation powered by Google Translate with native Konkani (`gom` / कोंकणी), Hindi, Marathi, Bengali, Tamil, Telugu, Kannada, Gujarati, Spanish, French, Russian, and German.

### 9. 🧳 Atomic Trip Setup & Companion Management (`/setup`)
* **Atomic Database Transactions**: Trip updates and companion synchronization execute via Supabase RPC (`atomic_trip_save`), ensuring trips and companions are updated atomically without partial data loss.
* **Validation Guardrails**: Companion phone number normalization (+91 E.164), age validation, and travel pace preferences.

---

## 🎨 UI/UX Design System: "Coastal Cyber-Luxury"

* **Warm Pearl Theme (Light)**: Alabaster pearl backgrounds (`oklch(0.978 0.012 85)`), frosted alabaster cards, warm sand borders.
* **Deep Obsidian Theme (Dark)**: Midnight obsidian abyss (`oklch(0.12 0.022 245)`), frosted glass panels.
* **Accent Colors**: Electric Cyan (`#00F2FE`), Sunset Coral (`#FF6B4A`), Warm Amber (`#FFA03A`), Neon Emerald (`#10B981`).
* **Typography**: `Fraunces`, `Plus Jakarta Sans`, and `JetBrains Mono`.
* **Micro-interactions**: Animated Sonner toasts on authentication and actions, shimmer skeleton loaders, and glassmorphic floating docks.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19.2, TypeScript 5.8, TanStack Router v1.170, TanStack Start v1.168, Vite 8 |
| **State & Cache** | TanStack Query v5 (`@tanstack/react-query`) |
| **Styling & UI** | TailwindCSS v4 with OKLCH tokens, Radix UI Primitives, Lucide React Icons, Sonner Toasts |
| **Mapping & Geospatial** | MapLibre GL v6 (`maplibre-gl`), OpenFreeMap Vector Styles (Liberty, Positron, Dark), 3D Terrain & Buildings, OpenStreetMap Raster Fallback |
| **Routing Engines** | Valhalla (Primary: car, scooter, bicycle, pedestrian) + OSRM (Automatic Fallover), Photon Geocoding, Overpass API (Corridor POI discovery with fallback mirror) |
| **Database & Auth** | Supabase PostgreSQL, Row Level Security (RLS) across 15 relations, Atomic Transaction RPCs (`atomic_trip_save`) |
| **AI Intelligence** | Google Gemini 2.5 Flash via `@ai-sdk/google` (Vercel AI SDK `ai` v7) |
| **Knowledge & Media** | Wikipedia REST API (proximity matching & verified thumbnails), Open-Meteo Weather API |
| **Notifications** | Twilio WhatsApp & SMS API with rate limiting, E.164 normalization, and honest mock mode |

---

## 📁 Project Architecture & Organization

The codebase is organized into modular directories with the root `README.md` as the primary entry point:

```
Tourism Guide/
├── README.md                          # Primary project overview & guide (this file)
│
├── frontend/                          # Client UI, React components & routing
│   ├── src/                           # Application source code
│   │   ├── components/                # Shared UI (AppShell, GoogleTranslate, WeatherWidget)
│   │   ├── features/                  # Feature modules:
│   │   │   ├── map/                   # MapLibre GL workspace, route planner, saved places layer
│   │   │   ├── explore/               # POI discovery, crowd gauges, Wikipedia cards
│   │   │   └── itinerary/             # Budget scheduler, pace controls, itinerary export
│   │   ├── routes/                    # TanStack file-based routes (/map, /explore, /dashboard, etc.)
│   │   ├── integrations/              # Supabase client and TypeScript schema definitions
│   │   ├── lib/                       # Routing algorithms, maps, SafeTag, and weather helpers
│   │   └── styles.css                 # TailwindCSS v4 design tokens & MapLibre stylesheets
│   ├── public/                        # Static branding, PWA manifest, and service worker (sw.js)
│   ├── .env.example                   # Environment configuration template
│   ├── package.json                   # Dependencies, scripts, and build tasks
│   ├── tsconfig.json                  # TypeScript strict compiler configuration
│   ├── vite.config.ts                 # Vite build & TanStack Start setup
│   └── README.md                      # Frontend module documentation
│
├── backend/                           # Database, server functions & APIs
│   ├── supabase/                      # PostgreSQL layer
│   │   ├── migrations/                # 15 SQL migrations (atomic saves, RLS, location sharing)
│   │   ├── repairs/                   # Consolidated runtime repair SQL scripts
│   │   └── schema.sql                 # Consolidated production database schema & RLS policies
│   ├── scripts/                       # Verification scripts (check-rls, check-services, check-itinerary)
│   ├── server.mjs                     # Production Node.js SSR server compatibility entry point
│   ├── API_SETUP.md                   # API keys (Gemini, Supabase, Valhalla, OSRM) configuration guide
│   └── README.md                      # Backend architecture documentation
│
├── docs/                              # Technical reports, audit notes & data source guides
│   ├── project-bug-audit-2026-10-12.md # Comprehensive 105-test audit & repair log
│   ├── runtime-audit-repair.md        # Database RLS & runtime migration guide
│   ├── explore-overhaul-report.md     # Explore module architecture & data sources
│   ├── map-refactor-notes.md          # MapLibre v6 migration & behavior checklist
│   ├── data-sources.md                # Upstream APIs (OSM, Overpass, Wikipedia, Open-Meteo)
│   └── seasonal-notes-todo.md         # Future seasonal recommendations and notes
│
└── misc/                              # Test suites, developer tools & run scripts
    ├── MASTER_PROJECT_DOCUMENTATION.md # Full 50KB+ technical architecture guide
    ├── information.md                 # API specifications & algorithms breakdown
    ├── tests/                         # 28 automated test files (105 passing tests)
    ├── scripts/                       # Test runners and TypeScript register loaders
    ├── run.bat                        # 1-click Windows development launcher
    ├── LICENSE                        # MIT License
    └── README.md                      # Misc module documentation
```

---

## 💻 Local Development & Setup

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher (v22+ recommended)
- **npm**: v10.0.0 or higher

### 2. Clone Repository
```bash
git clone https://github.com/Prajj11/Ideas.git
cd "Ideas/Tourism Guide"
```

### 3. Install Dependencies
```bash
cd frontend
npm install
```

### 4. Configure Environment Variables
Copy the template from `frontend/.env.example` to `frontend/.env`:
```bash
cp frontend/.env.example frontend/.env
```

Configure the following variables in `frontend/.env`:

| Variable | Scope | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Public (Client) | URL of your Supabase project instance |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public (Client) | Supabase publishable anon API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Secret service-role key for backend operations (never prefix with `VITE_`) |
| `GEMINI_API_KEY` | Server-only | Google AI Studio API key for Gemini 2.5 Flash itinerary rankings |
| `GEMINI_MODEL` | Server-only | Default AI model (`gemini-2.5-flash`) |
| `ROUTING_PROVIDER` | Server-only | Primary routing engine (`valhalla` or `osrm`, default: `valhalla`) |
| `VALHALLA_BASE_URL` | Server-only | Valhalla routing endpoint (default: `https://valhalla1.openstreetmap.de`) |
| `OSRM_BASE_URL` | Server-only | OSRM routing endpoint (default: `https://router.project-osrm.org`) |
| `OVERPASS_URL` | Server-only | Primary Overpass API endpoint for POI corridor queries |
| `OVERPASS_FALLBACK_URL` | Server-only | Secondary Overpass mirror used automatically on primary failure |
| `NOTIFY_MODE` | Server-only | SafeTag notification mode: `mock` (safe testing) or `live` |
| `NOTIFY_CHANNELS` | Server-only | Channels for SafeTag alerts: `whatsapp` or `whatsapp,sms` |
| `TWILIO_ACCOUNT_SID` | Server-only | Twilio Account SID (required for live notifications) |
| `TWILIO_AUTH_TOKEN` | Server-only | Twilio Auth Token (required for live notifications) |
| `TWILIO_WHATSAPP_FROM` | Server-only | Twilio sender WhatsApp number (e.g. `whatsapp:+14155238886`) |
| `TWILIO_SMS_FROM` | Server-only | Twilio sender SMS phone number |

### 5. Database Schema & Migrations
To initialize or update your Supabase database:
1. Open the **SQL Editor** in your Supabase Dashboard.
2. Execute the consolidated schema from [`backend/supabase/schema.sql`](./backend/supabase/schema.sql), or apply the sequential migrations in [`backend/supabase/migrations/`](./backend/supabase/migrations/).
3. Specifically ensure runtime tables and atomic trip saves are applied:
   - [`backend/supabase/repairs/20261011_runtime_tables.sql`](./backend/supabase/repairs/20261011_runtime_tables.sql)
   - [`backend/supabase/migrations/20261012000200_atomic_trip_save.sql`](./backend/supabase/migrations/20261012000200_atomic_trip_save.sql)
4. Verify Row Level Security policies:
   ```bash
   npm run check:rls
   ```

---

## ⚡ Quick Start

### 1. Start Development Server
```bash
# Option A: Terminal Command
cd frontend
npm run dev
# Live at http://localhost:5173

# Option B: 1-Click Windows Launcher (Auto-detects Node/npm, installs modules & launches Firefox)
misc\run.bat
```

### 2. Run Automated Test Suite (105 Tests)
The project includes a comprehensive suite of **105 automated unit and integration tests** across 28 test suites:

```bash
# From frontend folder:
cd frontend
npm test

# Or from project root:
node --import ./misc/scripts/register-typescript.mjs --test misc/tests/*.test.ts
```

### 3. Verification & Diagnostic Commands
```bash
# Verify external APIs (Gemini, Supabase, Valhalla, OSRM, Overpass, Photon)
npm run check:services

# Verify AI itinerary planner logic and deterministic fallbacks
npm run check:itinerary

# Verify Row-Level Security across 15 database tables & views
npm run check:rls

# Typecheck and lint codebase
npm run typecheck
npm run lint

# Build production bundle
npm run build
```

---

## 📚 Complete Technical Documentation

For in-depth blueprints covering database architecture, RLS security policies, mathematical route scoring algorithms, and API contracts:
* 👉 **[`misc/MASTER_PROJECT_DOCUMENTATION.md`](./misc/MASTER_PROJECT_DOCUMENTATION.md)** — Exhaustive 50KB+ technical architecture & engineering guide.
* 👉 **[`misc/information.md`](./misc/information.md)** — Architecture blueprints, API specifications, and schemas.
* 👉 **[`docs/project-bug-audit-2026-10-12.md`](./docs/project-bug-audit-2026-10-12.md)** — Comprehensive 105-test bug audit & resolution report.
* 👉 **[`docs/map-refactor-notes.md`](./docs/map-refactor-notes.md)** — MapLibre GL v6 migration guide and behavior checklist.
* 👉 **[`docs/runtime-audit-repair.md`](./docs/runtime-audit-repair.md)** — Database runtime tables and RLS verification procedures.
* 👉 **[`docs/data-sources.md`](./docs/data-sources.md)** — Upstream data sources (OSM, Overpass, Photon, Wikipedia, Open-Meteo).
* 👉 **[`backend/API_SETUP.md`](./backend/API_SETUP.md)** — External service configurations and key management.
* 👉 **[`backend/supabase/schema.sql`](./backend/supabase/schema.sql)** — Consolidated production database schema.

---

## 👥 Authors & Credits

* **Development Team**: Team KoPS
* **Initiative**: Safr (Smart Travel Safety Companion for India)

---

## 📜 License

This project is proprietary and developed for the Safr Smart Tourism Initiative.
