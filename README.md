# 🌴 Safr (Goa Guide Buddy) — AI Travel Safety Companion

## 📖 Overview

**Safr** is an intelligent, full-stack travel safety companion web application engineered to solve real-world tourism and security challenges across India, currently piloted in Goa. 

Traditional tourism apps only recommend places to visit; **Safr** actively protects travelers by combining **real-time geospatial safety scoring**, **turn-by-turn navigation with 1-tap Google Maps GPS**, **1.5 km road corridor hotspot search**, **marine beach swell flags**, **crowd density intelligence**, **smart transport mode recommendations**, **budget-enforcing AI itinerary planning**, **Zero-Knowledge family QR safety wristbands with age-validation checks**, **public emergency directory access**, and **multi-lingual accessibility** in 12+ Indian languages including Konkani.

---

## 🌟 Core Application Modules & Features

### 1. 🧭 Safe-Scored Wayfinding, Corridor Hotspots & Navigation (`/map`)
* **Safer vs. Fastest OSRM Engine**: Compares routes based on distance, road illumination, ghat hairpin bends, speed hazards, and accident history.
* **1.5 km Route Corridor Search**: Displays verified restaurants, hotels, and attractions along the chosen road path.
* **Night-Travel Guidance Mode**: Automatically activates between 19:00 and 06:00 to prioritize well-lit coastal roads over unlit highway ghats.
* **Turn-by-Turn Maneuver Drawer**: Step-by-step directions with maneuver icons and interactive Leaflet map pin focus.
* **1-Tap GPS Launch**: Deep-links directly into native Google Maps / Apple Maps turn-by-turn GPS navigation.

### 2. 🌊 Live Goa Weather & Marine Swell Station (`/dashboard`)
* **Real-time Panjim Weather**: Hourly precipitation radar, humidity, wind speeds, and UV index powered by Open-Meteo.
* **Drishti Marine Lifeguard Swimming Flags**:
  * 🟢 **Green (Safe)**: Calm sea, recreational swimming allowed in patrol zones.
  * 🟡 **Yellow (Caution)**: Moderate swell, keep children near shore.
  * 🔴 **Red (Danger)**: High tide swell, dangerous rip currents — strictly no swimming.

### 3. 🌴 Place Explorer, Transit Advisor & Bucket List (`/explore`)
* **Visual POI Cards**: Categorized by Vibe (*Beaches*, *Monuments*, *Nightlife*, *Cafes*, *Nature*).
* **AI Crowd Density Gauge**: Real-time crowd meter (*quiet*, *moderate*, *busy*, *packed*) with recommended visiting times and quieter nearby alternatives.
* **Best Mode of Transport Advisor**: Tailored recommendations for Scooters (narrow alleys), 4x4 Jeeps (Dudhsagar safari), Ro-Ro Ferries, or Walking.
* **Saved Places Wishlist (❤️)**: 1-Tap bookmarking persisted to the Supabase database.

### 4. ✨ Budget-Enforcing AI Itinerary Planner (`/itinerary`)
* **Time-Budgeted Optimization**: Schedules strictly within 1–24 hour budgets using real OSRM driving matrices, arrival buffers, and optional return trips.
* **Grounded AI Selection**: Google Gemini 2.5 Flash ranks candidate OpenStreetMap places with structured schema validation (cannot fabricate times or coordinates).
* **Map-Based Fallback**: Built-in algorithmic fallback guarantees a complete schedule even if AI services are rate-limited.
* **Print & Export Support**: Dedicated print stylesheet for PDF export and offline viewing.

### 5. 🏷️ Zero-Knowledge Family SafeTag Wristbands (`/safety-tags`)
* **Printable QR Wristbands**: Water-resistant labels with cryptographically random tokens for children and seniors.
* **Strict Age Category Validation**: Rejects invalid, missing, or mismatched ages (Kid: 0–17, Adult: 18–59, Senior: 60–120).
* **Zero-Knowledge Privacy Architecture**: Good Samaritans / finders can scan or visit `/find` to send instant location alerts to guardians without ever seeing guardian phone numbers or hotel locations.

### 6. 🚨 Public Verified Emergency Directory (`/emergency`)
* **Accessible without Login**: Directly reachable during crises.
* **Verified Official Contacts**: Goa Police (100/112), Ambulance (108), Fire (101), Pink Force, Drishti Marine Lifeguards (+91 832 252 0717), Goa Tourist Police (+91 832 242 8383), GMC Hospital Bambolim (+91 832 249 5000), Women Helpline (1091), Child Helpline (1098).

### 7. 🌐 Konkani & Multi-Language Indian Translator
* **Universal Accessibility**: Whole-page translation into Konkani (`gom` / कोंकणी), Hindi, Marathi, Bengali, Tamil, Telugu, Kannada, Gujarati, Spanish, French, Russian, and German.

---

## 🎨 UI/UX Design System: "Coastal Cyber-Luxury"

* **Warm Pearl Theme (Light)**: Alabaster pearl backgrounds (`oklch(0.978 0.012 85)`), frosted alabaster cards, warm sand borders.
* **Deep Obsidian Theme (Dark)**: Midnight obsidian abyss (`oklch(0.12 0.022 245)`), frosted glass panels.
* **Accent Colors**: Electric Cyan (`#00F2FE`), Sunset Coral (`#FF6B4A`), Warm Amber (`#FFA03A`), Neon Emerald (`#10B981`).
* **Typography**: `Fraunces`, `Plus Jakarta Sans`, and `JetBrains Mono`.
* **Micro-interactions**: Animated Sonner toasts on sign-in/sign-up, shimmer skeleton loaders, and glassmorphic navigation docks.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19.2, TypeScript 5.8, TanStack Router, TanStack Start, Vite 8 |
| **State & Cache** | TanStack Query v5 (`@tanstack/react-query`) |
| **Styling** | TailwindCSS v4 with OKLCH tokens, Lucide React Icons |
| **Mapping & Geospatial** | Leaflet 1.9.4, OSRM Routing Engine, Photon Geocoding, Overpass API |
| **Database & Auth** | Supabase PostgreSQL (`bfxtulimqxggjageyxrm`), Row Level Security, RPCs |
| **AI Intelligence** | Google Gemini 2.5 Flash via `@ai-sdk/google` (Vercel AI SDK `ai` v7) |
| **Weather & Marine** | Open-Meteo Weather API for Panjim |

---

## 💻 Local Development & Setup

### 1. Prerequisites
- **Node.js**: v24.0.0 or higher
- **npm**: v10.0.0 or higher

### 2. Clone Repository
```bash
git clone https://github.com/Prajj11/Ideas.git
cd "goa-guide-buddy-main"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
## 📁 Project Architecture & Organization

The codebase is organized into 3 modular directories with the root `README.md` as the primary entry point:

```
Tourism Guide/
├── README.md                      # Primary project overview & guide (this file)
│
├── frontend/                      # Client UI, React components & routing
│   ├── src/                       # Components, routes (/map, /explore, etc.), and styles
│   ├── public/                    # Static branding & vector assets
│   ├── package.json               # Frontend dependencies & run scripts
│   ├── tsconfig.json              # TypeScript strict configuration
│   ├── vite.config.ts             # Vite build & TanStack Start setup
│   └── README.md                  # Frontend module documentation
│
├── backend/                       # Database, server functions & APIs
│   ├── supabase/                  # PostgreSQL schema, migrations, and RLS policies
│   ├── scripts/                   # Backend verification (RLS, services, itinerary)
│   ├── server.mjs                 # Production Node.js SSR server with CSP
│   ├── API_SETUP.md               # API keys (Gemini, Supabase, OSRM) configuration
│   └── README.md                  # Backend architecture documentation
│
└── misc/                          # Technical docs, test suites & developer tools
    ├── MASTER_PROJECT_DOCUMENTATION.md # Full 50KB+ technical architecture guide
    ├── information.md             # API specifications & algorithms breakdown
    ├── tests/                     # 23 automated tests (travel, services, route comparison)
    ├── scripts/                   # Test utilities and TypeScript register runners
    ├── .agents/                   # Supabase agent skills & configurations
    ├── LICENSE                    # MIT License
    └── README.md                  # Misc module documentation
```

---

## ⚡ Quick Start

### 1. Start Development Server
```bash
# Option A: 1-Click Windows Launcher (Auto-installs dependencies & launches Firefox)
Double-click run.bat in the project root (or misc/run.bat)

# Option B: Terminal Command
cd frontend
npm run dev
# Live at http://localhost:5173
```

### 2. Run Automated Test Suite (23 Tests)
```bash
# From project root:
node --import ./misc/scripts/register-typescript.mjs --test misc/tests/*.test.ts

# Or from frontend folder:
cd frontend
npm test
```

---

## 📚 Complete Technical Documentation

For in-depth blueprints covering database architecture, RLS security policies, mathematical route scoring algorithms, and API contracts:
* 👉 **[`misc/information.md`](./misc/information.md)** — Comprehensive architecture, API specifications, and schemas.
* 👉 **[`misc/MASTER_PROJECT_DOCUMENTATION.md`](./misc/MASTER_PROJECT_DOCUMENTATION.md)** — Exhaustive end-to-end technical guide.
* 👉 **[`backend/API_SETUP.md`](./backend/API_SETUP.md)** — Service configurations and key management.
* 👉 **[`backend/supabase/schema.sql`](./backend/supabase/schema.sql)** — One-click consolidated database schema.

---

## 👥 Authors & Credits

* **Development Team**: Team KoS
* **Lead Engineer**: Prajwal ([@Prajj11](https://github.com/Prajj11))
* **Initiative**: Safr (Smart Travel Safety Companion for India)

---

## 📜 License

This project is proprietary and developed for the Safr Smart Tourism Initiative.
