# kinexentry.com

The public site: what Kinex Entry is, support, the privacy policy, terms, and
the account-deletion page Google Play requires. Plain HTML and one stylesheet —
nothing to build.

It is published with **GitHub Pages** from its own public repository, because
the app repository is private and free Pages only serves public ones.

## Publishing

1. Make a public repository `KinexEntry/kinexentry.com` on GitHub.
2. Copy this folder's contents to it and push (the app repo keeps the source of
   truth; `npm run site:publish` from the root does the copy and push once the
   `site-repo` remote below exists).
3. In that repository: **Settings → Pages → Source: Deploy from a branch →
   `main` / root**. The `CNAME` file here tells Pages the domain.
4. At Squarespace (Settings → Domains → kinexentry.com → DNS):

   | Type  | Host | Data                 |
   |-------|------|----------------------|
   | A     | @    | 185.199.108.153      |
   | A     | @    | 185.199.109.153      |
   | A     | @    | 185.199.110.153      |
   | A     | @    | 185.199.111.153      |
   | CNAME | www  | kinexentry.github.io |

   Remove any Squarespace-supplied A/CNAME records for `@` and `www` first.
5. Back in GitHub Pages settings, tick **Enforce HTTPS** once the domain shows
   as verified (up to an hour after DNS).

`api` and `office` stay pointed at Render; only the bare domain and `www` go
to Pages.

## Editing

Each page repeats the header and footer — five pages did not justify a
templating step. Change the business details in every footer together
(search for `[Street address]`).
