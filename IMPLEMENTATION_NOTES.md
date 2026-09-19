# Travel planner update — 19 September 2026

## What changed

- **Itineraries:** Replaced the fixed Goa attraction database and straight-line travel calculations with OpenStreetMap places, a real OSRM driving-time matrix, and a budget-enforcing scheduler. Gemini ranks only the supplied map IDs through a structured response; it cannot supply coordinates or schedule times. The planner remains usable with a clearly labelled map-based fallback if AI fails.
- **Time budgets:** The initial drive, visit lengths, arrival buffers and optional return drive count toward the selected 1–24 hours. Overnight times show the next day. Unreachable stops and road snaps over 1 km are excluded. A short plan may contain a single stop. Unused time is shown rather than filled with invented stops.
- **Destination and state:** Enter a destination and Indian state, use the saved Goa trip destination, or detect the current city/state and use GPS as the departure point. An unknown destination no longer silently becomes Panjim.
- **Route hotspots:** The map displays named restaurants, hotels and attractions within 1.5 km of the selected road route. Category controls, map markers, source links and directions are included.
- **Moving proximity:** “Follow my location” updates distances and filters nearby places while moving. Location watches stop on page exit. GPS denial and provider failures have visible recovery messages. Proximity distances are labelled straight-line estimates, not road detour times.
- **Suggest a place:** Added location-based suggestions with categories and radius controls. Place insights use actual listings, allow empty categories and provide directions/source links. Featured editorial Goa picks remain a separate discovery aid.
- **QR ages:** Both tag creation and group setup reject missing, fractional, negative, out-of-range or category-mismatched ages. Child = 0–17, adult = 18–59, senior = 60–120. These are app categories, not legal classifications. QR short codes now use cryptographic randomness. Database constraints are included in a migration.
- **Emergency directory:** Added Pink Force, Goa tourist assistance, tourist police, fire, child/women/senior support, GMC and coastal security contacts. The verified directory is bundled so it does not depend on Supabase. `/emergency` is now accessible without signing in. Official sources and the verification date appear on the page.
- **Konkani:** Added `gom` / कोंकणी to the dropdown and translator configuration. An unavailable or unready translation provider reports an error instead of silently pretending to switch. The legacy Google website widget remains a third-party dependency.
- **Data honesty:** Removed invented business fallbacks, fixed crowd percentages, fabricated marine/swimming flags, arbitrary alternative routes and inflated route scores. Weather is explicitly for Panjim. Family location simulation was removed; actual multi-device sharing is not implemented and is clearly labelled unavailable.
- **Credentials:** Kept Gemini on the server, removed `VITE_GEMINI_API_KEY`, loaded server environment settings correctly during Vite development/preview, authenticated paid AI requests, and removed `.env` from Git tracking while retaining the local file.

## Verification

- TypeScript and the production build were checked.
- Regression tests cover all 1–24 hour budgets in three paces, with and without returns, initial travel, time continuity, overnight times, unavailable roads, road snap rejection, age boundaries, input validation, corridor geometry, AI failure and ungrounded AI output.
- A live two-hour Panjim plan successfully used Gemini plus OSRM; it scheduled 73 minutes including an 11-minute return allowance, leaving the remaining budget free.
- A live Panjim–Baga road query returned a 16.3 km route and 327 corridor listings: 234 restaurants, 87 hotels and 6 attractions. Every returned listing passed the 1.5 km route-corridor check.
- Browser checks verified the homepage, the public emergency directory and the Konkani dropdown. Full signed-in browser workflows cannot be verified until Supabase is restored.

Run these from this directory with Node 24 or newer:

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Optional network checks use real services and the configured key:

```sh
npm run check:services
node scripts/check-services.mjs --generate
npm run check:itinerary
node --import ./scripts/register-typescript.mjs scripts/check-route.mjs
```

## Supabase work intentionally deferred

The configured Supabase hostname did not resolve during testing. At the user's request, the project connection was left unchanged. Sign-in, saved trips/itineraries, saved places and QR persistence still require an accessible project.

When restoring the existing project:

1. Update the public URL/publishable-key pairs listed in `API_SETUP.md`.
2. Ensure the existing migrations are present, then apply `supabase/migrations/20260919000000_age_category_validation.sql` through the Supabase migration workflow or SQL editor.
3. The new constraints use `NOT VALID`: they enforce new writes but preserve legacy rows. Review incorrect or missing existing ages before validating those constraints. Do not silently change a person's age to make it fit.
4. Verify login, group saving, invalid/valid QR ages, itinerary saving and saved places with a test account.

No remote migrations, account creation, paid subscriptions or deployments were performed.

## Remaining limits

OSRM driving times are estimates without live traffic. Visit lengths and arrival buffers are configurable planning rules; they are not measured visitor durations. Mapped venue hours are displayed for confirmation, not interpreted as guaranteed availability. Listings may be incomplete or outdated. Route scores are explicitly labelled rough road-name heuristics and do not measure lighting, accident rates or safety. GPS proximity is not turn-by-turn navigation or off-route rerouting; use the existing navigation link for that.

Family-device sharing needs consent, device updates and a real backend; entering a phone number cannot locate it. No live crowd or lifeguard feed is connected. Public map endpoints can be rate-limited; production should use appropriately provisioned endpoints.

## Official references

- [OSRM API](https://project-osrm.org/docs/v5.24.0/api/)
- [OpenStreetMap Overpass API and public instances](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Goa Police directory, including Pink Force and tourist police](https://citizen.goapolice.gov.in/web/guest/phone)
- [Goa Government helplines](https://www.goa.gov.in/)
- [Goa Tourism 1364 helpline](https://goatourism.gov.in/blog-list/experience-goa-with-ease-with-a-dedicated-helpline/)
- [Google language codes, including Konkani](https://docs.cloud.google.com/translate/docs/languages)
