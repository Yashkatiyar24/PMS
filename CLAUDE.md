@AGENTS.md

# Dharamshala PMS — project notes
- Multi-tenant PMS for dharamshalas. `backend/` Spring Boot 3.5/Java 21/Postgres+RLS; `frontend/` Next.js 16 App Router + Tailwind v4 + Radix + lucide; PWA, Hindi-first, offline queue.
- Run: `docker compose -f infra/docker-compose.yml up -d`; `cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev`; `cd frontend && npm run dev`. Dev login owner@pms.local / password123, PIN 1234.
- Frontend checks: `npm run typecheck && npm run lint && npm test`; browser smoke `npm run ui-check` (Playwright, needs dev server + seeded API at :8080).
- i18n: `src/i18n/en.json` + `hi.json` must have identical keys (tested). Money is integer paise; use `rupees()`/`toPaise()`.
- UI kit lives in `src/components/ui.tsx`; tokens in `src/app/globals.css`. Secondary forms go in `Sheet`, overflow actions in `Menu`.
- Session memory: `~/.claude/projects/-Users-neerajkatiyar-Documents-Neeraj-PMS/memory/session_log.md` — read first.
