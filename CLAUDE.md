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
- Emails go through the shared Redis queue `email:send`, processed by
  the shared `emailer` service (templates in `~/rcaldas/emailer/templates/`).

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
