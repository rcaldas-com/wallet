# rcaldas Wallet (Stellar)

Next.js 15 (App Router) app at `~/rcaldas/wallet`, porting an older Flask
wallet app that lives at `~/rcaldas/old_wallet` for reference. Served in
dev at `http://localhost:8001/wallet` (basePath `/wallet`). Distinct from
the finance module inside the `web` app (`~/rcaldas/web`) — different
repo, different concern. Shares the `user` Mongo collection with `web`
for auth (`walletUserId` cookie, `globalRole === 'admin'` for admin
access).

**The currencies in this system are tokens on the Stellar network**,
issued by the user's own issuer accounts. Base currency is R$ (BRL).
This is **not** a ledger in a database — balances live on-chain.

## Decisions locked in with the user (do not relitigate without asking)

- **Network: mainnet (PUBLIC)**, `horizon.stellar.org`. Deposits move
  real tokens. **Never execute a Stellar transaction from an agent** —
  the admin triggers those from the UI, manually, on purpose.
- **Quotes**: a separate `ccxt` microservice at `~/rcaldas/ccxt` (FastAPI,
  `GET /price?base=&quote=BRL`), Binance primary with kraken/okx
  fallback. Added to docker-compose as its own `ccxt` service. Chosen
  over MercadoBitcoin for precision and so it can be reused by the
  trading project (`~/tickbt`).
- **Reuses existing Mongo collections** rather than inventing new ones:
  `wallet` (custodial: user/type/key/secret), `issuer`
  (name/public_key/secret — issuer secrets come from Mongo, not `.env`),
  `deposit`, `withdraw`. `MAIN_WALLET` (env var name only — the secret
  that funds new accounts) is the one new env var this feature needed.

## Layout

- `app/lib/stellar.ts` — on-chain engine, server-only, ported from the
  old Flask app's `deposit_coin`/`set_account`.
- `app/lib/quotes.ts` — converts balances to BRL via the `ccxt` service.
- `app/lib/data-wallet.ts` — Mongo access.
- `app/lib/price-monitor.ts` — quote circuit breaker (recent addition —
  see git log, "Adiciona disjuntor de cotação").
- `app/lib/portfolio-history.ts` — periodic per-user BRL value snapshots
  (see "Scheduled tick" below).
- Emails go through the shared Redis queue `email:send`, processed by
  the shared `emailer` service (templates in `~/rcaldas/emailer/templates/`).

## Scheduled tick (`POST /api/internal/tick`)

Next.js has no built-in cron, and until this existed the price disjuntor
(`price-monitor.ts`) only ever got fed by whoever happened to load the
dashboard — go several days without a visit and the first visit back
compares today's price against a days-old baseline, tripping the breaker
for several coins at once (real bug reported by the user, not
hypothetical). This endpoint decouples "the work" (stays here, in
TypeScript, reusing the exact same functions a page render would call)
from "the schedule" (deliberately NOT solved inside this repo — see
below).

Two things happen per tick, best-effort/independent
(`Promise.allSettled`, one failing doesn't block the other):
1. `refreshAllPrices()` (`quotes.ts`) — prices every catalog coin once,
   keeping the disjuntor's rolling history warm regardless of traffic.
2. `capturePortfolioSnapshots()` (`portfolio-history.ts`) — one BRL-value
   snapshot per user with at least one wallet, into `portfolioSnapshot`.
   Foundation for a future "value over time" chart — no chart UI yet,
   just the data collection (needs the tick actually running for a while
   to have anything to plot).

Auth: header `x-internal-secret` must match `INTERNAL_TICK_SECRET`
(env). Unset → the endpoint fails closed (401 on every call) rather than
accepting unauthenticated requests — this is deliberate, not a bug to
"fix" by relaxing it.

**Who calls this** was deliberately left to the monitor system in the
base `rcaldas` (dev) repo rather than decided here — see
`monitor/MONITOR.md`. Resolved: `web` calls it over the **internal
Docker network** (`http://wallet:3000/api/internal/tick`), piggybacked
on the fleet's existing heartbeat traffic with a Redis lock, mirroring
`sweepOfflineHostsThrottled`/`OFFLINE_SWEEP_LOCK` in `web/lib/monitor.ts`
— no new service, no public-URL round trip. That also means the secret
never leaves the Docker network and the call isn't subject to
Cloudflare's edge (no WAF/proxy hop, no 100s timeout to worry about).

Gotcha for later: the internal call works unprefixed only because
`basePath: '/wallet'` in `next.config.js` is dev-only (production has no
basePath). Hitting this from something running in the *local* compose
stack (container-to-container, not through `localhost:8001`) would need
`http://wallet:3000/wallet/api/internal/tick` instead.

## Deposit/withdraw value at time of movement (`valueBrl`)

`deposit` and `withdraw` docs now carry a `valueBrl` field — the BRL
value of the amount at the moment the movement was recorded (best-effort;
`null` if the price lookup failed, and always `null` on movements from
before this field existed — there's no way to reconstruct a historical
quote after the fact). Set in `actions/deposit.ts`/`actions/withdraw.ts`
via `getBrlPrice` at record time, never recalculated. Powers the
"invested vs. now" comparison in the dashboard's movement history and the
summary P&L card (both silently work with partial data — a user with
only pre-feature deposits just doesn't see the card yet).

## Status as of last work here

Implemented: admin deposit flow (`/dashboard/admin/deposit`), user
dashboard (BRL balance + history + landing), withdrawal requests
(creates a `withdraw` doc with `status:requested` + emails the admin),
user can cancel their own pending withdrawal request, quote circuit
breaker. Recent git log also shows: withdrawal balance validation
discounts pending requests, MAX conversion fixed to use a valid currency
without requiring reload, converter/withdraw only offers custodied (not
external) balance.

**Still pending:** the admin's actual on-chain fulfillment of a
withdrawal request (the request/approval flow exists; the on-chain send
itself is the manual, deliberate step — see the mainnet decision above),
and letting users register a read-only external public key.

**How to apply:** Anything touching balances or the withdraw flow should
account for pending-but-not-yet-fulfilled withdrawal requests when
computing "available" balance — this was a real bug fixed once already
(see git log). Never add code that submits a Stellar transaction
automatically/unattended.
