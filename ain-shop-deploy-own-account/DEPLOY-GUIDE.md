# AIN Shop — deploy to your own account (no Tab)

Prepared 2026-11-17. This folder is a thin deploy shell for the shared
codebase: the website + server code lives in `../ain-shop-shared/web/`
(the shared core), and `wrangler.toml` here points at it. It was built
from the fixed test version (`ain-shop-v30-fixed-test`), plus the
deployment config Tab used (`../ain-shop-shared/web/tab-site.json`).
Nothing here touches the live site or the live app.

Verified 2026-11-17: the 509 search tests re-run on THIS copy pass
496/509 — same as the fixed test copy. The worker file is byte-identical
to the fixed test copy.

## What this folder is

- `../ain-shop-shared/web/` — the shared core: the whole website + the
  server code (`_worker.js`, the fixed search). `wrangler.toml` here
  points at it; edit the code there, never a copy here.
- `tests/` — the 509-test harness, so anyone can re-check the search.
- `wrangler.toml` — the deployment config. One line still needs filling
  in: `database_id` (see step 2).

## What you need first (all in your name)

1. A Cloudflare account — free, sign up at dash.cloudflare.com with your
   email. This is the host, like Tab's account was.
2. An OpenAI key — make one at platform.openai.com. It needs a payment
   card, because you pay for what you use. The old key lives on Tab's
   server; we do not have it. The site caps its own spending at $25/day.
3. A web address — Tab owns ainshop.sites.tab.bot, so a fresh deployment
   gets a free address like ain-shop.<your-name>.workers.dev, or a domain
   you buy (ainshop.shop / ainshop.app / ainshop.org, about $10–30/year).

## Steps (in order)

1. Sign up for Cloudflare (step 1 above) and sign in.
2. Create the database: DONE 2026-11-18 — the database already exists
   in his Cloudflare account as `ainshopdb` (confirmed empty: 0 tables,
   12.29 kB). Its ID is already in `wrangler.toml`:
   af2bee35-d60a-4717-b5b5-d63959de0b2f. (The guide originally said to
   name it `ain-shop-db`, but the database he made is `ainshopdb`, and
   the config now matches that name.)
3. Deploy: from this folder, run `npx wrangler deploy`. (Needs Node.js
   on the computer doing the deploy. First deploy only — later updates
   are the same command.)
4. Set the OpenAI key: the code stores it through `/api/admin/key` with a
   setup token. DONE 2026-11-18 — SETUP_HASH in
   `../ain-shop-shared/web/_worker.js` is now
   the hash of his new setup phrase (the phrase itself is not recorded
   anywhere). Then open `https://<your-address>/api/admin/key` with
   your phrase and your OpenAI key.
5. Open your new address and try a voice search. The database tables
   (search history, stores, owner page) create themselves on first use.
6. Owner page: the owner PIN from Tab's message will NOT work here —
   this is a fresh, empty database. How the first PIN is set on a fresh
   deployment is still to be checked in the code before this step.

## What this does NOT do

- It does not move the App Store app. The iPhone wrapper is a separate
  job (needs your Apple Developer account; the wrapper itself is still
  missing — see the operations manual).
- It does not move the ainshop.sites.tab.bot address. That address
  belongs to Tab's account.
- It does not copy any data from the live site (stores that joined,
  usage counts). A fresh deployment starts empty.

## If something goes wrong

- Deploy fails on database_id: you pasted the wrong ID, or step 2 was
  skipped. Re-check the D1 page in Cloudflare.
- Search works but voice does not: the OpenAI key was not stored
  (step 4), or the key has no money on it.
- Anything else: re-run the tests first — `cd tests && node
  harness-509.mjs` — they must stay 496/509. If they do, the code is
  fine and the problem is the account setup, not the search.
