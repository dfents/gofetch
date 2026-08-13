/* ============================================================
   GoFetch — shared app logic
   Loads inventory from data/domains.json at runtime
   ============================================================ */

(function () {
  "use strict";

  var DOMAINS = [];
  var GOFETCH_HOSTS = ["gofetch.com", "www.gofetch.com", "localhost", "127.0.0.1"];

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

  function logoMedia(d, cls) {
    if (d.logoVideo) {
      return (
        '<video class="' + cls + '" autoplay muted loop playsinline aria-label="' + d.domain + ' logo">' +
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
    var mode = record.pricingMode;
    var badge =
      mode === "buy_now" ? "Available · Buy now · " + fmtPrice(record) :
      mode === "make_offer" ? "Available · Offers invited" :
      "Privately held";

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

    container.innerHTML =
      '<div class="lander-shell">' +
        '<a class="lander-corner mono" href="https://gofetch.com/">' + markSVG(15) + "<span>GoFetch</span></a>" +
        '<div class="container lander-center">' +
          '<div class="lander-hero">' + hero + "</div>" +
          '<div class="lander-badge mono">' + badge + "</div>" +
          '<p class="lander-desc">' + record.description + "</p>" +
          '<div class="lander-meta mono">' +
            '<span>' + record.category.join(" / ") + "</span>" +
            '<span class="dot">·</span>' +
            '<span>.' + record.extension.toUpperCase() + "</span>" +
          "</div>" +
          othersHtml +
          '<p class="lander-bulk">Multiple names, or leasing rather than buying? Bulk and lease terms available — mention it in your enquiry.</p>' +
        "</div>" +
        '<div class="lander-fab" data-fab>' +
          '<button class="lander-fab-pill mono" type="button" data-fab-toggle>Make an enquiry</button>' +
          '<div class="lander-fab-panel" data-fab-panel>' +
            '<div class="lander-fab-head">' +
              '<span class="mono">Enquire about ' + record.domain + "</span>" +
              '<button class="modal-close" type="button" data-fab-close aria-label="Close">&times;</button>' +
            "</div>" +
            '<form data-fab-form name="enquiry" method="POST" data-netlify="true" netlify-honeypot="fab-hp">' +
              '<input type="hidden" name="form-name" value="enquiry">' +
              '<input type="hidden" name="domain" value="' + record.domain + '">' +
              '<input type="text" name="fab-hp" class="hp-field" tabindex="-1" autocomplete="off">' +
              '<div class="field"><input type="text" name="name" placeholder="Name" required></div>' +
              '<div class="field"><input type="email" name="email" placeholder="Email" required></div>' +
              '<div class="field"><input type="text" name="budget" placeholder="Offer / budget (optional)"></div>' +
              '<div class="field"><textarea name="message" placeholder="Message (optional)"></textarea></div>' +
              '<button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;">Send enquiry</button>' +
              '<div class="form-status" data-fab-status role="status"></div>' +
            "</form>" +
          "</div>" +
        "</div>" +
      "</div>";

    initLanderFab(container);
  }

  function initLanderFab(container) {
    var fab = container.querySelector("[data-fab]");
    if (!fab) return;
    var pill = fab.querySelector("[data-fab-toggle]");
    var panel = fab.querySelector("[data-fab-panel]");
    var closeBtn = fab.querySelector("[data-fab-close]");
    var form = fab.querySelector("[data-fab-form]");
    var status = fab.querySelector("[data-fab-status]");
    var openedAt = null;

    function open() {
      panel.classList.add("open");
      pill.classList.add("hidden");
      openedAt = Date.now();
      var first = form.querySelector('input[name="name"]');
      if (first) first.focus();
    }
    function close() {
      panel.classList.remove("open");
      pill.classList.remove("hidden");
    }

    pill.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) close();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var hp = form.querySelector('input[name="fab-hp"]').value;
      var elapsed = openedAt ? Date.now() - openedAt : 0;
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
          status.textContent = "Enquiry received. We'll respond directly.";
          status.className = "form-status ok";
          form.reset();
          setTimeout(close, 1800);
        })
        .catch(function () {
          status.textContent = "Couldn't send — please email hello@gofetch.com directly.";
          status.className = "form-status err";
        });
    });
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
    var result = document.getElementById("terminal-result");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = input.value.trim().toLowerCase();
      if (!q) return;
      result.classList.remove("show");
      void result.offsetWidth; /* restart animation */

      var direct = DOMAINS.find(function (d) {
        return d.domain.toLowerCase() === q || d.domain.toLowerCase() === q + ".com";
      });
      var partial = !direct && DOMAINS.filter(function (d) {
        return d.domain.toLowerCase().indexOf(q) !== -1 ||
          d.category.join(" ").toLowerCase().indexOf(q) !== -1;
      }).slice(0, 4);

      if (direct) {
        result.innerHTML =
          '<div class="status-line">FETCH COMPLETE</div>' +
          '<span class="tr-domain">' + direct.domain + "</span>" +
          '<div class="tr-row"><span class="k">STATUS</span><span class="v">' + (direct.pricingMode === "private" ? "PRIVATELY HELD" : "AVAILABLE") + "</span></div>" +
          '<div class="tr-row"><span class="k">CATEGORY</span><span class="v">' + direct.category.join(" / ").toUpperCase() + "</span></div>" +
          '<div class="tr-row"><span class="k">ACQUISITION</span><span class="v">' + STATUS_LABEL[direct.pricingMode].toUpperCase() + "</span></div>" +
          '<div class="tr-actions"><a class="btn btn-ghost" href="/lander.html?d=' + encodeURIComponent(direct.domain) + '">View asset</a>' +
          '<button class="btn btn-primary" data-enquire="' + direct.domain + '">Enquire</button></div>';
      } else if (partial && partial.length) {
        result.innerHTML =
          '<div class="status-line">' + partial.length + " RESULT" + (partial.length > 1 ? "S" : "") + " FOUND</div>" +
          partial.map(function (d) {
            return '<div class="tr-row"><span class="k mono">' + d.domain + '</span><span class="v"><a href="/lander.html?d=' + encodeURIComponent(d.domain) + '" style="text-decoration:underline">view →</a></span></div>';
          }).join("");
      } else {
        result.innerHTML =
          '<div class="status-line">QUERY LOGGED</div>' +
          '<div class="tr-empty">No public match for "' + escapeHtml(q) + '". Much of the collection is privately held. Tell us what you\'re building and we\'ll check the full inventory.</div>' +
          '<div class="tr-actions"><button class="btn btn-primary" data-enquire="' + escapeHtml(q) + '" data-mode="finder">Tell us what you need</button></div>';
      }
      result.classList.add("show");
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
    var featured = DOMAINS.filter(function (d) { return d.featured; }).slice(0, 6);
    grid.innerHTML = featured.map(assetCardHtml).join("");
  }

  function assetCardHtml(d) {
    return (
      '<a class="asset-card" href="/lander.html?d=' + encodeURIComponent(d.domain) + '">' +
      logoImg(d, "asset-logo") +
      '<span class="asset-domain mono">' + d.domain + "</span>" +
      '<span class="asset-cats mono">' + d.category.join(" · ") + "</span>" +
      '<span class="asset-status mono ' + d.pricingMode + '">' + STATUS_LABEL[d.pricingMode] + "</span>" +
      '<span class="asset-view mono">View asset →</span>' +
      "</a>"
    );
  }

  /* ----------------------------------------------------------
     Collection page: filters + listing
     ---------------------------------------------------------- */
  function initCollection() {
    var listEl = document.getElementById("listing");
    if (!listEl) return;

    var state = { ext: "all", cat: "all", mode: "all" };

    var exts = uniqueSorted(DOMAINS.map(function (d) { return d.extension; }));
    var cats = uniqueSorted(DOMAINS.reduce(function (acc, d) { return acc.concat(d.category); }, []));

    renderFilterGroup("filter-ext", "Extension", ["all"].concat(exts), state, "ext");
    renderFilterGroup("filter-cat", "Category", ["all"].concat(cats), state, "cat");
    renderFilterGroup("filter-mode", "Acquisition", ["all", "buy_now", "make_offer", "private"], state, "mode", {
      all: "All", buy_now: "Buy now", make_offer: "Make offer", private: "Private",
    });

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
      var filtered = DOMAINS.filter(function (d) {
        if (state.ext !== "all" && d.extension !== state.ext) return false;
        if (state.cat !== "all" && d.category.indexOf(state.cat) === -1) return false;
        if (state.mode !== "all" && d.pricingMode !== state.mode) return false;
        return true;
      });

      document.getElementById("collection-count").textContent =
        filtered.length + " asset" + (filtered.length === 1 ? "" : "s") + " shown · more held privately";

      if (!filtered.length) {
        listEl.innerHTML = '<div class="listing-empty mono">No matches. Try clearing a filter.</div>';
        return;
      }

      listEl.innerHTML = filtered.map(function (d) {
        return (
          '<a class="listing-row" href="/lander.html?d=' + encodeURIComponent(d.domain) + '">' +
          '<span class="listing-domain mono">' + d.domain + "</span>" +
          '<span class="listing-cats mono">' + d.category.join(" / ") + "</span>" +
          '<span class="listing-price mono">' + fmtPrice(d) + "</span>" +
          '<span class="listing-status mono ' + d.pricingMode + '">' + STATUS_LABEL[d.pricingMode] + "</span>" +
          "</a>"
        );
      }).join("");
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
        '<p class="lander-desc">This domain isn\u2019t in the public collection. Much of the portfolio is held privately \u2014 tell us what you\u2019re looking for and we\u2019ll check.</p>' +
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

      status.textContent = "Sending\u2026";
      status.className = "form-status";

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
        .then(function () {
          status.textContent = "Enquiry received. We\u2019ll respond directly.";
          status.className = "form-status ok";
          form.reset();
          setTimeout(closeModal, 1600);
        })
        .catch(function () {
          status.textContent = "Couldn\u2019t send \u2014 please email hello@gofetch.com directly.";
          status.className = "form-status err";
        });
    });
  }

  /* ----------------------------------------------------------
     Boot — load inventory data, then run page logic.
     Data lives in data/domains.json so it can be edited through
     the /admin CMS without touching code.
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
        initFeaturedGrid();
      }
    }

    initCollection();
    initStandaloneLander();
    initEnquiryModal();
  }

  document.addEventListener("DOMContentLoaded", function () {
    fetch("/data/domains.json")
      .then(function (res) {
        if (!res.ok) throw new Error("domains.json fetch failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        DOMAINS = data.domains || [];
        boot();
      })
      .catch(function (err) {
        console.error("GoFetch: failed to load inventory data", err);
        DOMAINS = [];
        boot();
      });
  });

  window.GoFetch = { markSVG: markSVG };
})();
