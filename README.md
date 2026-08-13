# GoFetch

Boutique domain-portfolio site for the Fenton / Butcher partnership.
Static HTML/CSS/vanilla JS — no build step, no framework, deploy-ready for Netlify
(same workflow as your other Netlify sites, e.g. zakisthebest.com).

## Structure

```
index.html          Homepage — hero, terminal search, featured assets, finder CTA
collection.html      Full inventory browse with filters (extension / category / acquisition type)
about.html            Short about page
lander.html            Standalone/query-param domain lander preview: /lander.html?d=example.com
admin/                Decap CMS — the /admin panel for managing listings (see below)
data/domains.json      The entire inventory, loaded at runtime. Edit via /admin or by hand.
images/logos/          Uploaded domain logos land here via the CMS
css/style.css          All styling — design tokens live at the top as CSS custom properties
js/app.js              Fetches domains.json, then handles search, filtering, modal + form logic, hostname routing
netlify.toml            Clean URLs + basic security headers
```

**Analytics**: intentionally not wired up yet, by choice — no tracking
script, no cookie banner needed as a result. When you want stats, either
[Plausible](https://plausible.io) or [Fathom](https://usefathom.com) (both
cookieless, no consent banner required) or Netlify Analytics (server-log
based, zero client script) are one script tag / dashboard toggle away.

**Bots**: the enquiry form already has a honeypot field and a minimum
time-on-form check. Netlify Forms also has free built-in Akismet spam
filtering you can switch on in the Forms tab of your site settings. If you
want stronger protection later, Cloudflare Turnstile is free and mostly
invisible to real visitors.

## Managing listings: the /admin panel (Decap CMS)

You don't need to touch code to add, edit, or remove domains. `/admin` is a
Git-based CMS (Decap CMS, formerly Netlify CMS) that edits
`data/domains.json` for you and commits the change — Netlify then rebuilds
the site automatically, same as any other push.

**Note on setup:** Netlify's old "Identity + Git Gateway" combo (what a lot
of older Decap tutorials show) is now deprecated — Netlify's own docs say
new Git Gateway setups aren't recommended. The steps below use the current
approach instead: Decap talks to GitHub directly, and Netlify is used only
as the OAuth handshake (not the deprecated Identity service). This also
means this repo needs to actually live on GitHub — the current deploy is a
manual "Netlify Drop" upload with no repo behind it, so that's step one.

### One-time setup

1. **Push this project to GitHub.** From inside the unzipped `gofetch`
   folder:
   ```
   git init
   git add .
   git commit -m "Initial GoFetch site"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/gofetch.git
   git push -u origin main
   ```
   (Create the empty repo on GitHub first, named e.g. `gofetch`.)

2. **Link your Netlify project to that repo**, so future commits (including
   ones the CMS makes) trigger a rebuild automatically instead of you
   needing to re-drop the zip. In the Netlify dashboard: your project →
   **Project configuration → Build & deploy → Continuous deployment** →
   link/connect a Git repository → pick the `gofetch` repo you just pushed.

3. **Register a GitHub OAuth App** (this is what lets you log into `/admin`
   with your GitHub account): go to
   [github.com/settings/developers](https://github.com/settings/developers)
   → New OAuth App.
   - Homepage URL: your Netlify site URL (e.g. `https://gofetch.com`)
   - Authorization callback URL: `https://api.netlify.com/auth/done`
     (this exact value — it's Netlify's shared callback endpoint, not yours)
   - Save, then copy the **Client ID** and generate/copy a **Client Secret**.

4. **Add that OAuth app to Netlify:** your project →
   **Project configuration → Access & security → OAuth** → install/add a
   provider → GitHub → paste in the Client ID and Client Secret from step 3.

5. **Point the CMS config at your real repo.** Open `admin/config.yml` and
   change:
   ```yaml
   repo: "YOUR-GITHUB-USERNAME/gofetch"
   ```
   to your actual GitHub username/org and repo name, commit, push.

6. Visit `gofetch.com/admin/`, click **Login with GitHub**, authorize the
   app. You'll land in a "Domains" panel listing every entry in
   `data/domains.json` — dropdowns for acquisition mode, a checkbox for
   Featured, an image or video uploader for the logo, etc.

Anyone else who should be able to edit listings needs to be added as a
**collaborator on the GitHub repo** (Settings → Collaborators) — since
there's no more Identity layer, GitHub repo access *is* CMS access.

Nothing else needs to change day-to-day — the homepage, collection page,
and lander template all read `data/domains.json` at runtime, so an edit
through `/admin` shows up on the live site as soon as the rebuild finishes
(typically under a minute).

### Editing the data file directly (fallback)

If you'd rather skip the CMS for a given change, `data/domains.json` is
still just a plain JSON file — open it, edit the array under `"domains"`,
and push. Same shape either way:

```json
{
  "domain": "example.com",
  "extension": "com",
  "logo": "",
  "logoVideo": "",
  "tagline": "Short line, optional flavour.",
  "description": "1–3 sentences used on the lander page.",
  "category": ["Technology", "Brandable"],
  "pricingMode": "buy_now",
  "price": 9500,
  "featured": true,
  "hasLander": true,
  "acquired": 2024
}
```

### Logos

Two optional fields, checked in this order:

- `logoVideo` — path to an mp4/webm (e.g. an animated mark). Autoplays,
  muted, looped, on the lander hero.
- `logo` — a static image, used only if there's no video.

Leave both empty to fall back to the plain typographic domain name — most
entries can skip this; use it selectively for domains you've actually
designed a mark for. `thylacine.ai` in the sample data uses `logoVideo` as
a working example.

## The lander experience — consistent branding, minimal by design

Every domain lander (whether reached via its own hostname or via
`/lander.html?d=`) renders the same minimal shell, so branding stays
consistent across the whole portfolio without every lander looking like a
generic template:

- **A small fixed mark in the top-left** — GoFetch's node glyph + wordmark,
  linking back to `gofetch.com`. Deliberately quiet; it's provenance, not
  navigation.
- **The hero** — the domain's video or image logo if it has one, otherwise
  just its name set large in the display type. One status line underneath
  (Buy now / Offers invited / Privately held), one short description.
- **A floating enquiry widget, bottom-right** — a small pill that expands
  into a compact form in place, rather than a full-page contact section or
  a centred modal. This is the only call-to-action on the page.
- **"Also from GoFetch"** — three other listed domains, auto-selected
  (domains with their own lander enabled are prioritised, then Featured
  ones), each linking straight to that domain's own lander. Plus a line
  about bulk and lease terms, and a link to the full collection. This is
  generated automatically from `data/domains.json` — nothing to maintain by
  hand, and it updates itself as your inventory changes.

The site's full navigation header/footer (Home / Collection / About) only
appears on `gofetch.com` itself — landers hide it in favour of the small
corner mark, so a domain's lander doesn't read like "a page on someone
else's website."

## Pointing a domain at its own lander

This is one application serving many domains. When a request arrives on a
hostname (rather than gofetch.com), `js/app.js` checks it against
`data/domains.json`. If there's a match with `hasLander: true`, the homepage's
JS swaps out the GoFetch home content for that domain's lander before paint.

To wire a domain up:

1. Add its record via `/admin` (or directly in `data/domains.json`) with
   `hasLander` switched on.
2. In Netlify: **Project configuration → Domain management → Add a
   domain** — add the domain as an additional domain on this same project
   (not a new site/project). Point its DNS at Netlify per the instructions
   Netlify gives you for that domain (nameservers, or A + CNAME records at
   your registrar).
3. Done. One Netlify project serves every domain you add this way — the
   hostname check in `js/app.js` figures out which lander to show. No
   redeploy needed for future price/description edits either, since the
   whole app reads `data/domains.json` at runtime.

This also means `pagan.com` **renders** its lander directly — it does not
redirect to `gofetch.com/pagan_com`. The visitor's address bar stays on
`pagan.com`, which matters for trust and for that domain's own SEO value.
If you separately want a canonical browsing path on GoFetch itself (e.g.
`gofetch.com/collection/pagan-com`), that's what `lander.html?d=pagan.com`
already serves — a clean-URL rewrite for that path can be added to
`netlify.toml` if you want prettier links.

Domains without a dedicated record still resolve — they'll just show the
GoFetch homepage until a record is added.

## Enquiry form

The enquiry modal is wired for Netlify Forms (`data-netlify="true"`,
honeypot field `enq-hp`). Netlify detects the form at deploy time because
the markup exists directly in each page's static HTML (not injected purely
by JS). Submissions land under Project configuration → Forms in Netlify, and can be
forwarded to email or Slack from there.

Basic spam protection: honeypot field + a minimum time-on-form check before
a submission is accepted (very fast submissions are rejected client-side).

If you'd rather not use Netlify Forms, swap the `fetch("/", ...)` call in
`initEnquiryModal()` (in `js/app.js`) for any other form endpoint (Formspree,
a serverless function, etc.) — the rest of the modal logic is unchanged.

## GoFetch Finder (future)

The "Looking for something specific?" CTAs throughout the site all open the
same enquiry modal with a `finder` mode label — that's the seam for the
future natural-language matching product. When ready, either:

- keep it simple: those enquiries just land as regular messages for manual
  matching against the private inventory, or
- build it out: add an endpoint that takes the free-text brief, embeds/
  matches it against `data/domains.js` (including unlisted, non-public
  records kept server-side), and returns candidates into the modal or a
  results page.

No architectural changes are needed to ship that later — the CTA, copy, and
data shape already anticipate it.

## Local preview

Any static file server works, e.g.:

```
npx serve .
```

Opening `index.html` directly via `file://` will work for layout/browsing,
but the hostname-lander behaviour only makes sense once deployed (or tested
via `/lander.html?d=domain.com`, which works locally).
