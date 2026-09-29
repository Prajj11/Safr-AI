# 📦 Safr — Documentation, Tests & Tools (Misc)

This folder contains project-wide technical documentation, test suites, developer tools, and deployment scripts.

---

## 📁 Directory Structure

```
misc/
├── MASTER_PROJECT_DOCUMENTATION.md   # Exhaustive 50KB+ technical architecture & engineering guide
├── information.md                    # Technical documentation, API schemas, and feature breakdown
├── tests/                            # Automated test suite (23 passing tests)
│   ├── travel.test.ts                # Schedule budgeting, phone validation & route tests
│   ├── services.test.ts              # External provider fallbacks & itinerary generation tests
│   └── route-comparison.test.ts      # Road surface, illumination & safety score tests
├── scripts/                          # Utility & deployment scripts
│   ├── deploy-antideploy.mjs         # Production deployment runner for Antideploy
│   └── register-typescript.mjs       # TypeScript import loader for native Node tests
├── .agents/                          # Supabase Postgres agent skills and custom instructions
├── skills-lock.json                  # Skill dependency lockfile
├── .antideploy.json                  # Antideploy application link configuration
├── GEMINI.md                         # Workspace rules (Firefox preview launcher)
├── eslint.config.js                  # Linter configuration
├── .prettierrc                       # Code formatting rules
├── run.bat                           # 1-click Windows development launcher
└── LICENSE                           # MIT License
```

---

## 🧪 Running Tests

From either the project root or the `frontend` folder:

```bash
# From project root:
node --import ./misc/scripts/register-typescript.mjs --test misc/tests/*.test.ts

# Or from frontend folder:
cd frontend
npm test
```
