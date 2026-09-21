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

## Impersonation ("ver como o usuário")

Eye button per user in the admin overview ("Saldo por usuário"), same
behavior as the web app: two signed 2h cookies (`impersonate_original_user`
/ `impersonate_target_user`) on the shared `.rcaldas.com` domain, read by
both apps; the yellow banner + "Voltar ao admin" end it.

- Start is a **Server Action** (`lib/actions/impersonate.ts`), not a `fetch`
  to a route: dev serves the wallet under `basePath: /wallet`, so
  `fetch('/api/impersonate')` would hit the *web* app's route. Only the REAL
  session (`getRealSessionUserId`) can start it, and it must be admin;
  refuses self, invalid ids and the master admin (server-side too, since a
  Server Action is directly callable — web only hides the button).
- Invariant behind the React `cache()` in `auth.ts`: the start action must
  never call `getSessionUserId`/`getCurrentUser` before setting the cookies.
- **Open question, not implemented:** while impersonating, the admin can
  still run *any* user action as that user — including `requestConversion`,
  which executes on-chain for the user's custodial funds. Web allows writes
  too, so this mirrors it, but here it moves real money; a read-only mode
  (block conversion/withdraw actions while the impersonation cookies are
  active) would be the safer default.

## Positions / "operations" (`app/lib/positions.ts`)

An *operation* is the life of a position in one coin: opens on the first
entry, grows with later entries at **weighted average cost** (one position
per coin — merged on purpose, not separate lots), closes when the balance
hits zero. Decided with the user: separate lots need a lot-selection rule
(FIFO...) for every partial exit, and the on-chain balance is fungible
anyway; the individual entries stay visible in the history with their own
value at the time, so per-purchase performance isn't lost, only not
accounted separately. Average cost is also the usual method for crypto
in Brazilian IR (confirm with an accountant before relying on it for a
filing).

- **Derived by replaying the full ledger** (`getUserLedger` in
  `data-wallet.ts` — NOT `getUserMovements`, which is capped at 100), pure
  and DB-free so it's unit-testable. Single source of truth: no position
  collection to drift.
- BRL is the base currency: no position, no result. A conversion with a BRL
  leg needs no stored value (BRL->X cost exactly `amountFrom`; X->BRL
  proceeds exactly `amountTo`) — this is how legacy conversions get a cost
  without any write.
- Any entry without a known value makes that position's cost `null` until it
  zeroes and reopens; an exit larger than the ledger knew about also yields
  `null`. **Unknown is shown as nothing, never as a guessed number.**
- `requestConversion` computes the close of the outgoing coin *before*
  executing (ledger doesn't have the swap yet) and stores `valueBrl`,
  `costBasisBrl`, `realizedBrl`, `positionClosed` on the `conversion` doc
  (facts at the time, like `valueBrl` on deposits). `valueBrl` on the
  conversion is also the incoming coin's cost — required when neither leg
  is BRL. Completed withdrawals reduce the position (proportional cost) but
  don't record a realized result yet.
- The coin card shows cost/result only when the replayed quantity matches
  the custodial balance (tolerance 1e-6); incomplete history => hidden.

**Manual backfills done in production** (no code path re-creates them; all
tagged `valueBrlSource` so they're distinguishable from recorded quotes):
Laura Guimaraes' 3 legacy deposits (BRL 100 -> R$100, EUR 8.498 -> R$50,
PAXG 0.004412 -> R$100) on 2026-09-20. Her BTC/XLM cost (R$50 each) comes
from BRL conversions, not deposits — do NOT add fake deposits for them
(would double count the BRL 100 deposit). Other users' legacy deposits
still have `valueBrl: null` and only the admin knows their real amounts.

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
