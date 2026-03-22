# CLAUDE.md — Noir Factory

## What this repo is
Noir Factory — autonomous multi-company content production and engagement pipeline.
This is the **canonical backend** for all automation: engagement bot, health monitor, token monitor, and dead letter queue.

**Live URL:** https://noir-factory.onrender.com
**Bot/Control UI:** https://noir-factory.onrender.com/bot
**Repo:** rf1212/noir-factory

## IMPORTANT: REPO OWNERSHIP
**ALL repos are under the rf1212 org account.**
The `Info-hash12` personal account is **RETIRED** and must NEVER be used for product repos.
Do NOT create new repos under Info-hash12 under any circumstances.

## DO NOT confuse with
- `rf1212/dashboard-central` — The Collective, read-only traffic analytics only
- `rf1212/alladre` — Alladre product
- `rf1212/home-start-now` — ProxiTap frontend (proxitap.com)
- `rf1212/proxiconnect` — ProxiTap Firebase backend

## DO NOT touch
- `rf1212/alladre`
- `rf1212/proxiconnect`
- `rf1212/RawFunds--Foundation-`
- `rf1212/omega-private`
- `rf1212/ghost-jobs`

## Tech stack
Node.js / Express, Render (auto-deploys from main), Supabase (ghzvppbkuudkpzlcidlx)

## Auth
X-Auth-Token: noirfactory2026
X-Company-ID: <uuid> (required for company-scoped endpoints)

## Companies
- RawFunds:  8b36e7e6-c942-41b1-81b7-a70204a37811
- ProxiTap:  cc1c8956-efbf-48d5-969c-ca58022fb76c
- Alladre:   c24f54e5-ba20-46c2-aa73-765677419ce6

## Automation Endpoints (v2 — ported from Cloudflare Worker)
All require `X-Auth-Token` and `X-Company-ID` headers.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/automation/status` | All automation statuses |
| POST | `/api/automation/toggle` | Enable/disable bot for company+platform |
| POST | `/api/automation/config` | Update schedule config for company |
| POST | `/api/automation/trigger` | Manually trigger one automation run |

### Automation types
- `engagement_bot` — Per-company engagement (Facebook, Instagram, Threads; Twitter/TikTok = MCP stubs)
- `health_monitor` — Supabase + Cloudflare Analytics + Facebook token health checks
- `token_monitor` — Detects tokens expiring within 7 days, auto-refreshes Facebook tokens
- `dead_letter_queue` — Retries failed engagement_log entries (max 3 retries)

### Cron schedules
- Engagement bot: `*/5 * * * *` (every 5 min)
- Health monitor: `*/15 * * * *` (every 15 min)
- Token monitor: `0 2 * * *` (daily 2 AM UTC)
- Dead letter queue: `*/5 * * * *` (every 5 min)

## Key environment variables
```
SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
CF_ANALYTICS_TOKEN, CF_ZONE_PROXITAP, CF_ZONE_ALLADRE
META_APP_ID, META_APP_SECRET
```

<!-- deploy trigger: triggered to reconnect Render after repo transfer -->
