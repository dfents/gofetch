/* ============================================================
   GoFetch — shared app logic
   Loads inventory from data/domains.json (and, where used,
   data/picks.json) at runtime
   ============================================================ */

(function () {
  "use strict";

  var DOMAINS = [];
  var PICKS = [];
  var BUNDLES = [];
  var GOFETCH_HOSTS = ["gofetch.com", "www.gofetch.com", "localhost", "127.0.0.1"];
  var ATOM_PAY_TOKEN = "4f3f3a48bdbed5cb";
  var atomPayScriptLoaded = false;
  /* Change this one value to update every Telegram button on the site at once. */
  var TELEGRAM_HANDLE = "dfents";

  function loadAtomPayScript() {
    // pay-with-atom.js scans the DOM for ".pay-with-atom" buttons as soon as
    // it loads (via jQuery's ready handler), so it must be injected only
    // after our button already exists — GoFetch's landers render async from
    // a data/domains.json fetch, so a static <script> in <head> would run
    // before the button exists and silently find nothing.
    if (atomPayScriptLoaded) return;
    atomPayScriptLoaded = true;
    var s = document.createElement("script");
    s.src = "https://www.atom.com/scripts/pay-with-atom.js";
    document.body.appendChild(s);
  }

  function atomPayButtonHTML(record) {
    if (record.pricingMode !== "buy_now" || !record.price) return "";
    return (
      '<div class="lander-atompay">' +
        '<button class="pay-with-atom" ' +
          'data-domain-name="' + record.domain + '" ' +
          'data-domain-price="' + record.price + '" ' +
          'data-token="' + ATOM_PAY_TOKEN + '" ' +
          'data-installments="" ' +
          'data-down-payment="" ' +
          'data-host-name="https://www.atom.com">' +
          "<span>Buy With</span>" +
          '<img src="https://www.atom.com/assets/pay.png" alt="Atom Logo">' +
        "</button>" +
      "</div>"
    );
  }

  /* Reused everywhere a Telegram paper-plane glyph is needed: the sitewide
     contact button, the "also includes a Telegram handle" badge on a
     listing's own lander, and the matching tag on Collection-page rows
     and bundle cards. */
  var TELEGRAM_ICON_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

  function telegramButtonHTML() {
    return (
      '<a class="btn btn-telegram" href="https://t.me/' + TELEGRAM_HANDLE + '" target="_blank" rel="noopener">' +
        TELEGRAM_ICON_SVG +
        "<span>Telegram</span>" +
      "</a>"
    );
  }

  /* For listings sold together with a Telegram handle (e.g. blackbadge.com
     alongside @blackbadge) -- separate from the general "contact us on
     Telegram" button above, this says the handle itself is part of what's
     for sale. Works on both domain records and bundle objects, since both
     may carry a telegramHandle field. */
  function telegramIncludedHTML(record) {
    if (!record.telegramHandle) return "";
    return (
      '<div class="lander-includes mono">' +
        TELEGRAM_ICON_SVG +
        '<span>Includes <strong>@' + escapeHtml(record.telegramHandle) + '</strong> on Telegram</span>' +
      "</div>"
    );
  }

  function statusLine(record) {
    if (record.pricingMode === "buy_now") return "Domain name for sale · Buy now · " + fmtPrice(record);
    if (record.pricingMode === "make_offer") return "Domain name for sale · Offers invited";
    return "Domain name for sale · Enquire";
  }

  function landerActionsHTML(record) {
    return (
      '<div class="lander-actions">' +
        '<button type="button" class="btn btn-primary" data-enquire="' + escapeHtml(record.domain) + '">Make an enquiry</button>' +
        telegramButtonHTML() +
      "</div>"
    );
  }

  function bundleStatusLine(b) {
    var priceBit = b.priceText ? " · " + escapeHtml(b.priceText) : "";
    if (b.pricingMode === "make_offer") return "Bundle for sale · Offers invited" + priceBit;
    return "Bundle for sale · Enquire" + priceBit;
  }

  function bundleActionsHTML(b) {
    var domainsJoined = (b.domains || []).join(" + ");
    return (
      '<div class="lander-actions">' +
        '<button type="button" class="btn btn-primary" data-enquire="' + escapeHtml(domainsJoined) + '">Make an enquiry</button>' +
        telegramButtonHTML() +
      "</div>"
    );
  }

  var STATUS_LABEL = {
    buy_now: "Buy now",
    make_offer: "Make offer",
    private: "Privately held",
  };

  function fmtPrice(d) {
    if (d.pricingMode === "buy_now" && d.price) {
      return "USD $" + d.price.toLocaleString("en-US");
    }
    if (d.pricingMode === "make_offer") return "Offers invited";
    return "Not disclosed";
  }

  function logoMedia(d, cls, opts) {
    var loop = !(opts && opts.noLoop);
    if (d.logoVideo) {
      return (
        '<video class="' + cls + '" autoplay muted' + (loop ? " loop" : "") + ' playsinline aria-label="' + d.domain + ' logo">' +
        '<source src="' + d.logoVideo + '" type="video/mp4"></video>'
      );
    }
    if (d.logo) {
      return '<img class="' + cls + '" src="' + d.logo + '" alt="' + d.domain + ' logo">';
    }
    return "";
  }

  function pickOtherNames(current, n) {
    var pool = DOMAINS.filter(function (d) {
      return d.domain !== current.domain;
    });
    pool.sort(function (a, b) {
      var score = function (d) { return (d.hasLander ? 2 : 0) + (d.featured ? 1 : 0); };
      return score(b) - score(a);
    });
    return pool.slice(0, n);
  }

  /* Same "also from GoFetch" picker as pickOtherNames, but excludes a whole
     list of domains at once -- used on a bundle's own lander so it doesn't
     recommend the names already included in that bundle. */
  function pickOtherNamesExcluding(excludeDomains, n) {
    var exclude = {};
    (excludeDomains || []).forEach(function (d) {
      exclude[(d || "").toLowerCase()] = true;
    });
    var pool = DOMAINS.filter(function (d) {
      return !exclude[d.domain.toLowerCase()];
    });
    pool.sort(function (a, b) {
      var score = function (d) { return (d.hasLander ? 2 : 0) + (d.featured ? 1 : 0); };
      return score(b) - score(a);
    });
    return pool.slice(0, n);
  }

  function otherNameLink(d) {
    var href = d.hasLander ? "https://" + d.domain + "/" : "https://gofetch.com/lander.html?d=" + encodeURIComponent(d.domain);
    return (
      '<a class="lander-other-item" href="' + href + '">' +
      '<span class="mono">' + d.domain + "</span>" +
      '<span class="mono lander-other-status ' + d.pricingMode + '">' + STATUS_LABEL[d.pricingMode] + "</span>" +
      "</a>"
    );
  }

  function logoImg(d, cls) {
    if (!d.logo) return "";
    return '<img class="' + cls + '" src="' + d.logo + '" alt="' + d.domain + ' logo">';
  }

  function byDomain(name) {
    var n = (name || "").toLowerCase().replace(/^www\./, "");
    return DOMAINS.find(function (d) {
      return d.domain.toLowerCase() === n;
    });
  }

  function byBundle(slug) {
    var s = (slug || "").toLowerCase();
    return BUNDLES.find(function (b) {
      return (b.slug || "").toLowerCase() === s;
    });
  }

  function bundleHref(b) {
    return "/bundle.html?b=" + encodeURIComponent(b.slug || "");
  }

  /* ----------------------------------------------------------
     Hostname-aware routing: if this deploy is being served on
     an owned domain's hostname, render that domain's lander in
     place of the GoFetch homepage. Point any domain's DNS/records
     at this same site and it self-configures — no code change.
     ---------------------------------------------------------- */
  function currentHostRecord() {
    var host = window.location.hostname.toLowerCase();
    if (GOFETCH_HOSTS.indexOf(host) !== -1) return null;
    var record = byDomain(host);
    return record && record.hasLander ? record : null;
  }

  function renderLanderInto(container, record) {
    if (record.minimal) {
      renderMinimalLanderInto(container, record);
      return;
    }
    var mode = record.pricingMode;

    var media = logoMedia(record, "lander-media");
    var hero = media
      ? media + '<div class="lander-caption mono">' + record.domain + "</div>"
      : '<h1 class="lander-domain mono">' + record.domain + "</h1>";

    var others = pickOtherNames(record, 3);
    var othersHtml = others.length
      ? '<div class="lander-other">' +
          '<div class="lander-other-label mono">Also from GoFetch</div>' +
          '<div class="lander-other-list">' + others.map(otherNameLink).join("") + "</div>" +
          '<a class="lander-other-more mono" href="https://gofetch.com/collection.html">View full collection →</a>' +
        "</div>"
      : "";

    var descHtml = record.description ? '<p class="lander-desc">' + record.description + "</p>" : "";
    var categoryHtml = (record.category && record.category.length) ? record.category.join(" / ") + '<span class="dot">·</span>' : "";

    container.innerHTML =
      '<div class="lander-shell">' +
        '<a class="lander-corner mono" href="https://gofetch.com/">' + markSVG(15) + "<span>GoFetch</span></a>" +
        '<div class="container lander-center">' +
          '<div class="lander-hero">' + hero + "</div>" +
          '<div class="lander-badge mono">' + statusLine(record) + "</div>" +
          telegramIncludedHTML(record) +
          atomPayButtonHTML(record) +
          landerActionsHTML(record) +
          descHtml +
          '<div class="lander-meta mono">' +
            '<span>' + categoryHtml + "</span>" +
            '<span>.' + record.extension.toUpperCase() + "</span>" +
          "</div>" +
          othersHtml +
          '<p class="lander-bulk">Multiple names, or leasing rather than buying? Bulk and lease terms available — mention it in your enquiry.</p>' +
        "</div>" +
      "</div>";

    if (mode === "buy_now" && record.price) loadAtomPayScript();
  }

  function renderMinimalLanderInto(container, record) {
    var media = logoMedia(record, "lander-minimal-media", { noLoop: true });

    container.innerHTML =
      '<div class="lander-shell lander-shell--minimal">' +
        '<a class="lander-corner mono" href="https://gofetch.com/">' + markSVG(15) + "<span>GoFetch</span></a>" +
        '<div class="lander-minimal-center">' + media + "</div>" +
        '<div class="lander-minimal-info">' +
          '<div class="lander-badge mono">' + statusLine(record) + "</div>" +
          telegramIncludedHTML(record) +
          atomPayButtonHTML(record) +
          landerActionsHTML(record) +
        "</div>" +
      "</div>";

    if (record.pricingMode === "buy_now" && record.price) loadAtomPayScript();
  }

  /* Bundle landers reuse the same shell/typography as a single-domain
     lander (lander-hero, lander-badge, lander-actions, lander-other, ...)
     but never AtomPay -- its checkout is tied to one specifically-owned
     domain name, so bundles are always sold via enquiry. */
  function renderBundleInto(container, b) {
    var domainsLine = (b.domains || []).map(escapeHtml).join(" + ");
    var title = b.name ? escapeHtml(b.name) : domainsLine;
    var hero = '<h1 class="lander-domain mono">' + title + "</h1>" +
      (b.name ? '<div class="lander-caption mono">' + domainsLine + "</div>" : "");

    var others = pickOtherNamesExcluding(b.domains, 3);
    var othersHtml = others.length
      ? '<div class="lander-other">' +
          '<div class="lander-other-label mono">Also from GoFetch</div>' +
          '<div class="lander-other-list">' + others.map(otherNameLink).join("") + "</div>" +
          '<a class="lander-other-more mono" href="https://gofetch.com/collection.html">View full collection →</a>' +
        "</div>"
      : "";

    var descHtml = b.description ? '<p class="lander-desc">' + b.description + "</p>" : "";
    var count = (b.domains || []).length;
    var countLabel = count + " domain" + (count === 1 ? "" : "s") + " in this bundle";

    container.innerHTML =
      '<div class="lander-shell">' +
        '<a class="lander-corner mono" href="https://gofetch.com/">' + markSVG(15) + "<span>GoFetch</span></a>" +
        '<div class="container lander-center">' +
          '<div class="lander-hero">' + hero + "</div>" +
          '<div class="lander-badge mono">' + bundleStatusLine(b) + "</div>" +
          telegramIncludedHTML(b) +
          bundleActionsHTML(b) +
          descHtml +
          '<div class="lander-meta mono"><span>' + countLabel + "</span></div>" +
          othersHtml +
          '<p class="lander-bulk">Interested in the whole bundle, or just one piece of it? Say so in your enquiry.</p>' +
        "</div>" +
      "</div>";
  }

  /* ----------------------------------------------------------
     Logo mark — reusable inline SVG
     ---------------------------------------------------------- */
  function markSVG(size) {
    size = size || 22;
    return (
      '<svg class="mark" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' +
      '<line x1="12" y1="5" x2="5" y2="13"></line>' +
      '<line x1="12" y1="5" x2="19" y2="13"></line>' +
      '<line x1="5" y1="13" x2="12" y2="20"></line>' +
      '<line x1="19" y1="13" x2="12" y2="20"></line>' +
      '<line x1="12" y1="5" x2="12" y2="20" opacity="0.25"></line>' +
      '<circle cx="12" cy="5" r="1.6"></circle>' +
      '<circle cx="5" cy="13" r="1.6"></circle>' +
      '<circle cx="19" cy="13" r="1.6"></circle>' +
      '<circle cx="12" cy="20" r="1.9"></circle>' +
      "</svg>"
    );
  }

  /* ----------------------------------------------------------
     Terminal search (homepage hero)
     ---------------------------------------------------------- */
  function initTerminalSearch() {
    var form = document.getElementById("terminal-form");
    if (!form) return;
    var input = document.getElementById("terminal-input");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = input.value.trim();
      window.location.href = q
        ? "/collection.html?q=" + encodeURIComponent(q)
        : "/collection.html";
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ----------------------------------------------------------
     Featured grid (homepage)
     ---------------------------------------------------------- */
  function initFeaturedGrid() {
    var grid = document.getElementById("featured-grid");
    if (!grid) return;
    var featured = DOMAINS.filter(function (d) { return d.featured; }).slice(0, 4);
    grid.innerHTML = featured.map(assetCardHtml).join("");
  }

  function assetCardHtml(d) {
    return (
      '<a class="asset-card" href="/lander.html?d=' + encodeURIComponent(d.domain) + '">' +
      logoImg(d, "asset-logo") +
      '<span class="asset-domain">' + d.domain + "</span>" +
      '<span class="asset-cats">' + d.category.join(" · ") + "</span>" +
      '<span class="asset-status badge badge-' + d.pricingMode + '">' + STATUS_LABEL[d.pricingMode] + "</span>" +
      "</a>"
    );
  }

  /* ----------------------------------------------------------
     Handpicked by Daniel (homepage) — editorial picks that live
     on OTHER marketplaces, not part of the GoFetch inventory.
     Sourced from data/picks.json, managed via the CMS or the
     bulk-listing admin tool.
     ---------------------------------------------------------- */
  function initHandpickedGrid() {
    var grid = document.getElementById("handpicked-grid");
    if (!grid) return;
    var band = grid.closest(".handpicked-band");
    if (!PICKS.length) {
      if (band) band.style.display = "none";
      return;
    }
    grid.innerHTML = PICKS.slice(0, 6).map(pickCardHtml).join("");
  }

  function pickCardHtml(p) {
    var badgeClass = p.status === "buy_now" ? "badge-buy_now" : "badge-liquidation";
    var badgeLabel = p.status === "buy_now" ? "Buy now" : "At auction";
    return (
      '<div class="pick-card">' +
        '<div class="pick-card-top">' +
          '<span class="badge ' + badgeClass + '">' + badgeLabel + "</span>" +
          '<span class="pick-platform">via ' + escapeHtml(p.platform || "") + "</span>" +
        "</div>" +
        '<div class="pick-name">' + escapeHtml(p.name || "") + "</div>" +
        '<div class="pick-note">' + escapeHtml(p.note || "") + "</div>" +
        '<div class="pick-foot">' +
          '<span class="pick-price">' + escapeHtml(p.price || "") + "</span>" +
          '<a class="pick-link" href="' + (p.url || "#") + '" target="_blank" rel="noopener">View listing ↗</a>' +
        "</div>" +
      "</div>"
    );
  }

  /* ----------------------------------------------------------
     Liquidation & current deals — GoFetch's own names, tagged
     saleType: "liquidation" in data/domains.json. No live bidding:
     just Buy now (AtomPay) or Make an offer.
     ---------------------------------------------------------- */
  function liquidationDomains() {
    return DOMAINS.filter(function (d) { return d.saleType === "liquidation"; });
  }

  function dealRowHtml(d) {
    var isBuyNow = d.pricingMode === "buy_now" && d.price;
    var ctaLabel = isBuyNow ? "Buy now" : "Make offer";
    var ctaAttr = isBuyNow
      ? 'href="/lander.html?d=' + encodeURIComponent(d.domain) + '"'
      : 'href="#" data-enquire="' + escapeHtml(d.domain) + '"';
    var ctaTag = isBuyNow ? "a" : "button";
    return (
      '<div class="deal-row">' +
        '<span class="badge badge-liquidation deal-badge">Liquidation</span>' +
        '<span class="deal-name">' + d.domain + "</span>" +
        '<span class="deal-meta">' + (d.tagline || (isBuyNow ? "Liquidation pricing · fixed" : "Liquidation pricing · offers invited")) + "</span>" +
        '<span class="deal-price">' + (isBuyNow ? fmtPrice(d) : "Make offer") + "</span>" +
        "<" + ctaTag + ' class="deal-cta' + (isBuyNow ? "" : " is-offer") + '" ' + ctaAttr + ">" + ctaLabel + "</" + ctaTag + ">" +
      "</div>"
    );
  }

  function initDealsList() {
    var list = document.getElementById("deals-list");
    if (!list) return;
    var deals = liquidationDomains().slice(0, 6);
    var section = list.closest("#liquidate-home");
    if (!deals.length) {
      if (section) section.style.display = "none";
      return;
    }
    list.innerHTML = deals.map(dealRowHtml).join("");
  }

  /* ----------------------------------------------------------
     /liquidate.html — the full liquidation listing page
     ---------------------------------------------------------- */
  function liqCardHtml(d) {
    var isBuyNow = d.pricingMode === "buy_now" && d.price;
    var cta = isBuyNow
      ? atomPayButtonHTML(d)
      : '<button class="btn btn-primary" style="width:100%;justify-content:center;" data-enquire="' + escapeHtml(d.domain) + '">Make an offer</button>';
    return (
      '<div class="liq-card">' +
        '<span class="badge badge-liquidation">Liquidation</span>' +
        '<span class="liq-name">' + d.domain + "</span>" +
        '<span class="liq-cats">' + (d.category || []).join(" · ") + "</span>" +
        '<span class="liq-price">' + (isBuyNow ? fmtPrice(d) : "Make offer") + "</span>" +
        '<div class="liq-actions">' + cta + "</div>" +
      "</div>"
    );
  }

  function initLiquidatePage() {
    var grid = document.getElementById("liquidate-grid");
    if (!grid) return;
    var items = liquidationDomains();
    if (!items.length) {
      grid.outerHTML = '<div class="liquidate-empty">Nothing listed here yet — check back soon, or <a href="#" data-enquire="" data-mode="finder" style="text-decoration:underline;">tell us what you\'re after</a>.</div>';
      return;
    }
    grid.innerHTML = items.map(liqCardHtml).join("");
    var hasBuyNow = items.some(function (d) { return d.pricingMode === "buy_now" && d.price; });
    if (hasBuyNow) loadAtomPayScript();
  }

  /* ----------------------------------------------------------
     Collection page: filters + listing
     ---------------------------------------------------------- */
  function levenshtein(a, b) {
    a = (a || "").toLowerCase();
    b = (b || "").toLowerCase();
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) dp[i] = [i];
    for (var j = 0; j <= n; j++) dp[0][j] = j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[m][n];
  }

  function closestMatches(q, pool, n) {
    return pool
      .map(function (d) {
        var name = d.domain.split(".")[0];
        var dist = Math.min(levenshtein(q, name), levenshtein(q, d.domain));
        return { d: d, dist: dist };
      })
      .sort(function (a, b) { return a.dist - b.dist; })
      .slice(0, n)
      .map(function (x) { return x.d; });
  }

  function listingRowHtml(d) {
    var href = "/lander.html?d=" + encodeURIComponent(d.domain);
    var statusHtml = d.pricingMode === "private"
      ? '<button type="button" class="listing-status mono private" data-enquire="' + escapeHtml(d.domain) + '">Enquire</button>'
      : '<span class="listing-status mono ' + d.pricingMode + '">' + STATUS_LABEL[d.pricingMode] + "</span>";
    var telegramTag = d.telegramHandle
      ? '<span class="listing-telegram-tag" title="Includes @' + escapeHtml(d.telegramHandle) + ' on Telegram">' + TELEGRAM_ICON_SVG + "</span>"
      : "";
    return (
      '<div class="listing-row" data-href="' + href + '">' +
      '<a class="listing-domain mono" href="' + href + '">' + d.domain + telegramTag + "</a>" +
      '<span class="listing-cats mono">' + d.category.join(" / ") + "</span>" +
      '<span class="listing-price mono">' + fmtPrice(d) + "</span>" +
      statusHtml +
      "</div>"
    );
  }

  function bundleCardHtml(b) {
    var domainsText = (b.domains || []).join(" + ");
    var telegramTag = b.telegramHandle
      ? '<span class="bundle-card-telegram" title="Includes @' + escapeHtml(b.telegramHandle) + ' on Telegram">' + TELEGRAM_ICON_SVG + "</span>"
      : "";
    return (
      '<a class="bundle-card" href="' + bundleHref(b) + '">' +
        '<div class="bundle-card-top mono"><span class="bundle-card-tag">Bundle</span>' + telegramTag + "</div>" +
        '<div class="bundle-card-name mono">' + escapeHtml(b.name || domainsText) + "</div>" +
        '<div class="bundle-card-domains mono">' + escapeHtml(domainsText) + "</div>" +
      "</a>"
    );
  }

  /* Bundles have no single extension/category, so they sit above the
     filtered listing as their own strip rather than trying to fit the
     Collection page's per-domain filters. Hidden entirely when there are
     no bundles yet. */
  function initBundleStrip() {
    var el = document.getElementById("bundle-strip");
    if (!el) return;
    if (!BUNDLES.length) {
      el.style.display = "none";
      return;
    }
    el.innerHTML =
      '<div class="bundle-strip-label mono">Bundles &amp; pairs</div>' +
      '<div class="bundle-strip-list">' + BUNDLES.map(bundleCardHtml).join("") + "</div>";
  }

  /* Rows built by listingRowHtml are no longer a single <a> (a private
     row needs its own Enquire control that opens the modal instead of
     navigating). Clicking anywhere in the row except that control, or
     the domain link, still goes to the lander — handled here once via
     delegation since rows are re-rendered on every filter/search change. */
  function initListingRowNav() {
    document.addEventListener("click", function (e) {
      var row = e.target.closest(".listing-row[data-href]");
      if (!row) return;
      if (e.target.closest("[data-enquire]")) return;
      if (e.target.closest("a")) return;
      window.location.href = row.getAttribute("data-href");
    });
  }

  function initCollection() {
    var listEl = document.getElementById("listing");
    if (!listEl) return;
    var fallbackEl = document.getElementById("listing-fallback");
    var noteEl = document.getElementById("search-note");
    var searchInput = document.getElementById("collection-search-input");

    var state = { ext: "all", cat: "all", mode: "all" };

    var exts = uniqueSorted(DOMAINS.map(function (d) { return d.extension; }));
    var cats = uniqueSorted(DOMAINS.reduce(function (acc, d) { return acc.concat(d.category); }, []));

    renderFilterGroup("filter-ext", "Extension", ["all"].concat(exts), state, "ext");
    renderFilterGroup("filter-cat", "Category", ["all"].concat(cats), state, "cat");
    renderFilterGroup("filter-mode", "Acquisition", ["all", "buy_now", "make_offer", "private"], state, "mode", {
      all: "All", buy_now: "Buy now", make_offer: "Make offer", private: "Private",
    });

    if (searchInput) {
      var params = new URLSearchParams(window.location.search);
      var initialQ = params.get("q") || "";
      if (initialQ) searchInput.value = initialQ;
      searchInput.addEventListener("input", render);
    }

    function uniqueSorted(arr) {
      return Array.from(new Set(arr)).sort();
    }

    function renderFilterGroup(id, title, values, state, key, labelMap) {
      var el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = '<h4>' + title + '</h4>' + values.map(function (v) {
        var label = labelMap ? labelMap[v] : (v === "all" ? "All" : v.toUpperCase());
        return '<button class="filter-option" data-key="' + key + '" data-val="' + v + '">' + label + "</button>";
      }).join("");
      el.querySelectorAll(".filter-option").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state[key] = btn.dataset.val;
          el.querySelectorAll(".filter-option").forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          render();
        });
      });
      el.querySelector(".filter-option").classList.add("active");
    }

    function render() {
      var base = DOMAINS.filter(function (d) {
        if (state.ext !== "all" && d.extension !== state.ext) return false;
        if (state.cat !== "all" && d.category.indexOf(state.cat) === -1) return false;
        if (state.mode !== "all" && d.pricingMode !== state.mode) return false;
        return true;
      });

      var q = searchInput ? searchInput.value.trim().toLowerCase() : "";
      var shown = base;
      fallbackEl.innerHTML = "";

      if (!q) {
        noteEl.style.display = "none";
        noteEl.innerHTML = "";
      } else {
        var matched = base.filter(function (d) {
          return d.domain.toLowerCase().indexOf(q) !== -1 ||
            d.category.join(" ").toLowerCase().indexOf(q) !== -1;
        });

        if (matched.length) {
          shown = matched;
          noteEl.innerHTML = matched.length + " result" + (matched.length === 1 ? "" : "s") + " for \u201c" + escapeHtml(q) + "\u201d";
          noteEl.style.display = "";
        } else {
          var closest = closestMatches(q, base, 4);
          shown = closest;
          noteEl.innerHTML = "No exact match for \u201c" + escapeHtml(q) + "\u201d. Showing the closest names, and the full collection below.";
          noteEl.style.display = "";

          var rest = base.filter(function (d) { return closest.indexOf(d) === -1; });
          if (rest.length) {
            fallbackEl.innerHTML =
              '<div class="listing-fallback-head">Full collection</div>' +
              '<div class="listing">' + rest.map(listingRowHtml).join("") + "</div>";
          }
        }
      }

      document.getElementById("collection-count").textContent =
        shown.length + " asset" + (shown.length === 1 ? "" : "s") + " shown · more held privately";

      if (!shown.length) {
        listEl.innerHTML = '<div class="listing-empty mono">No matches. Try clearing a filter.</div>';
        return;
      }

      listEl.innerHTML = shown.map(listingRowHtml).join("");
    }

    render();
  }

  /* ----------------------------------------------------------
     Standalone lander page (lander.html?d=domain.com)
     ---------------------------------------------------------- */
  function initStandaloneLander() {
    var container = document.getElementById("standalone-lander");
    if (!container) return;
    var params = new URLSearchParams(window.location.search);
    var name = params.get("d");
    var record = name ? byDomain(name) : null;

    if (!record) {
      container.innerHTML =
        '<div class="lander-shell">' +
        '<a class="lander-corner mono" href="https://gofetch.com/">' + markSVG(15) + "<span>GoFetch</span></a>" +
        '<div class="container lander-center">' +
        '<div class="lander-hero"><h1 class="lander-domain mono">Asset not listed</h1></div>' +
        '<div class="lander-badge mono">Not found</div>' +
        '<p class="lander-desc">This domain isn’t in the public collection. Much of the portfolio is held privately — tell us what you’re looking for and we’ll check.</p>' +
        '<div class="lander-actions"><button class="btn btn-primary" data-enquire="' + (name ? escapeHtml(name) : "") + '" data-mode="finder">Tell us what you need</button>' +
        '<a class="btn btn-ghost" href="/collection.html">Browse collection</a></div>' +
        "</div></div>";
      return;
    }
    document.title = record.domain + " — GoFetch";
    var siteHeader = document.querySelector(".site-header");
    var siteFooter = document.querySelector("footer");
    if (siteHeader) siteHeader.style.display = "none";
    if (siteFooter) siteFooter.style.display = "none";
    renderLanderInto(container, record);
  }

  /* ----------------------------------------------------------
     Standalone bundle page (bundle.html?b=slug)
     ---------------------------------------------------------- */
  function initStandaloneBundle() {
    var container = document.getElementById("standalone-bundle");
    if (!container) return;
    var params = new URLSearchParams(window.location.search);
    var slug = params.get("b");
    var bundle = slug ? byBundle(slug) : null;

    if (!bundle) {
      container.innerHTML =
        '<div class="lander-shell">' +
        '<a class="lander-corner mono" href="https://gofetch.com/">' + markSVG(15) + "<span>GoFetch</span></a>" +
        '<div class="container lander-center">' +
        '<div class="lander-hero"><h1 class="lander-domain mono">Bundle not listed</h1></div>' +
        '<div class="lander-badge mono">Not found</div>' +
        '<p class="lander-desc">This bundle isn’t in the public collection. Tell us what you’re looking for and we’ll check.</p>' +
        '<div class="lander-actions"><button class="btn btn-primary" data-enquire="" data-mode="finder">Tell us what you need</button>' +
        '<a class="btn btn-ghost" href="/collection.html">Browse collection</a></div>' +
        "</div></div>";
      return;
    }
    document.title = (bundle.name || bundle.domains.join(" + ")) + " — GoFetch";
    var siteHeader2 = document.querySelector(".site-header");
    var siteFooter2 = document.querySelector("footer");
    if (siteHeader2) siteHeader2.style.display = "none";
    if (siteFooter2) siteFooter2.style.display = "none";
    renderBundleInto(container, bundle);
  }

  /* ----------------------------------------------------------
     Enquiry modal + Netlify-compatible form submission
     ---------------------------------------------------------- */
  function initEnquiryModal() {
    var overlay = document.getElementById("enquiry-overlay");
    if (!overlay) return;
    var form = document.getElementById("enquiry-form");
    var domainField = document.getElementById("enq-domain");
    var status = document.getElementById("enquiry-status");
    var title = document.getElementById("enquiry-title");
    var startedAt = Date.now();

    document.addEventListener("click", function (e) {
      var trigger = e.target.closest("[data-enquire]");
      if (!trigger) return;
      e.preventDefault();
      var domain = trigger.getAttribute("data-enquire") || "";
      domainField.value = domain;
      title.textContent = domain ? "Enquire about " + domain : "Tell us what you're building";
      status.textContent = "";
      status.className = "form-status";
      overlay.classList.add("open");
      startedAt = Date.now();
      var nameInput = document.getElementById("enq-name");
      if (nameInput) nameInput.focus();
    });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    document.getElementById("enquiry-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    function closeModal() {
      overlay.classList.remove("open");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      /* honeypot + time-trap spam protection */
      var hp = document.getElementById("enq-hp").value;
      var elapsed = Date.now() - startedAt;
      if (hp || elapsed < 1200) {
        status.textContent = "Something went wrong. Please try again.";
        status.className = "form-status err";
        return;
      }

      var data = new FormData(form);
      var body = new URLSearchParams();
      data.forEach(function (v, k) { body.append(k, v); });

      status.textContent = "Sending…";
      status.className = "form-status";

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
        .then(function () {
          status.textContent = "Enquiry received. We’ll respond directly.";
          status.className = "form-status ok";
          form.reset();
          setTimeout(closeModal, 1600);
        })
        .catch(function () {
          status.textContent = "Couldn’t send — please email hello@gofetch.com directly.";
          status.className = "form-status err";
        });
    });
  }

  /* ----------------------------------------------------------
     Boot — load inventory data, then run page logic.
     Data lives in data/domains.json (and data/picks.json for the
     homepage's Handpicked band) so it can be edited through the
     /admin CMS or the bulk-listing tool without touching code.
     ---------------------------------------------------------- */
  function boot() {
    document.querySelectorAll(".mark-slot").forEach(function (el) {
      el.innerHTML = markSVG(el.dataset.size || 22);
    });

    var homeApp = document.getElementById("home-app");
    if (homeApp) {
      var hostRecord = currentHostRecord();
      if (hostRecord) {
        document.title = hostRecord.domain + " — GoFetch";
        homeApp.style.display = "none";
        var siteHeader = document.querySelector(".site-header");
        var siteFooter = document.querySelector("footer");
        if (siteHeader) siteHeader.style.display = "none";
        if (siteFooter) siteFooter.style.display = "none";
        var landerRoot = document.getElementById("lander-app");
        if (landerRoot) {
          landerRoot.style.display = "block";
          renderLanderInto(landerRoot, hostRecord);
        }
      } else {
        initTerminalSearch();
        initHandpickedGrid();
        initFeaturedGrid();
        initDealsList();
      }
    }

    initCollection();
    initBundleStrip();
    initLiquidatePage();
    initStandaloneLander();
    initStandaloneBundle();
    initEnquiryModal();
    initListingRowNav();

    document.body.classList.remove("pre-boot");
  }

  document.addEventListener("DOMContentLoaded", function () {
    Promise.all([
      fetch("/data/domains.json").then(function (res) {
        if (!res.ok) throw new Error("domains.json fetch failed: " + res.status);
        return res.json();
      }).then(function (data) {
        DOMAINS = data.domains || [];
      }).catch(function (err) {
        console.error("GoFetch: failed to load inventory data", err);
        DOMAINS = [];
      }),
      fetch("/data/picks.json").then(function (res) {
        if (!res.ok) throw new Error("picks.json fetch failed: " + res.status);
        return res.json();
      }).then(function (data) {
        PICKS = data.picks || [];
      }).catch(function (err) {
        console.error("GoFetch: failed to load handpicked picks", err);
        PICKS = [];
      }),
      fetch("/data/bundles.json").then(function (res) {
        if (!res.ok) throw new Error("bundles.json fetch failed: " + res.status);
        return res.json();
      }).then(function (data) {
        BUNDLES = data.bundles || [];
      }).catch(function (err) {
        console.error("GoFetch: failed to load bundles", err);
        BUNDLES = [];
      }),
    ]).then(boot);
  });

  window.GoFetch = { markSVG: markSVG };
})();
