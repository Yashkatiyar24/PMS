@AGENTS.md

# Padav — project notes
- Multi-tenant PMS for small and mid-sized properties (hotels, guest houses, dharamshalas). `backend/` Spring Boot 3.5/Java 21/Postgres+RLS; `frontend/` Next.js 16 App Router + Tailwind v4 + Radix + lucide; PWA, Hindi-first, offline queue.
- Run: `docker compose -f infra/docker-compose.yml up -d`; `cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev`; `cd frontend && npm run dev`. Dev login owner@pms.local / password123, PIN 1234.
- Frontend checks: `npm run typecheck && npm run lint && npm test`; browser smoke `npm run ui-check` (Playwright, needs dev server + seeded API at :8080).
- i18n: `src/i18n/en.json` + `hi.json` must have identical keys (tested). Money is integer paise; use `rupees()`/`toPaise()`.
- UI kit lives in `src/components/ui.tsx`; tokens in `src/app/globals.css`. Secondary forms go in `Sheet`, overflow actions in `Menu`. The design contract is `frontend/DESIGN.md` (shadow cards, no hairline borders, tokens only, kit radii); `design-guard.test.ts` fails the build on a breach.
- Mobile: `mobile/` is the React Native twin (Ignite/Expo, MST, apisauce). Checks: `cd mobile && npm run check`. Rule: screens import only `app/utils` and `app/services/api`, never date-fns/zod/MMKV/Firebase directly. Docs: `mobile/FEATURE_INVENTORY.md`, `mobile/SCREEN_MAP.md`, `mobile/FEATURE_PARITY_CHECKLIST.md`.
- Session memory: `~/.claude/projects/-Users-neerajkatiyar-Documents-Neeraj-PMS/memory/session_log.md` — read first.
- Project skills live in `.claude/skills/` (installed via `npx skills add …`, pinned in `skills-lock.json`; `npx skills update` refreshes). Use `ui-ux-pro-max` for design decisions (`python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p Padav`), `frontend-design` + `web-design-guidelines` for building/reviewing UI, `vercel-react-best-practices` + `vercel-composition-patterns` for React/Next.js code, `framer-motion` / `css-native` / `micro-interactions` / `page-transitions` / `loading-states` / `feedback-indicators` / `accessible-motion` / `web-motion-design` for animation, `vercel-react-view-transitions` for route transitions, `webapp-testing` for Playwright checks.
