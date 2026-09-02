// netlify/functions/bulk-add.js
//
// Bulk-list / bulk-price tool backend. Receives pasted rows from
// /admin/bulk.html, merges them into data/domains.json, and commits
// straight to the `main` branch via the GitHub Contents API — Netlify
// then auto-deploys, same as any other push.
//
// Requires two environment variables, set once in the Netlify UI
// (Site configuration -> Environment variables), never committed here:
//   GITHUB_TOKEN   a fine-grained GitHub personal access token, scoped
//                  ONLY to the dfents/gofetch repo, with just the
//                  "Contents: Read and write" permission.
//   ADMIN_SECRET   any password you choose. The bulk-add page asks for
//                  it before it will publish anything, so a stranger
//                  who finds the /admin/bulk.html URL can't post to it.
//
// Row format (one per line), pasted into the textarea on the page:
//   domain, price, pricingMode, category|category, saleType
//
// Only "domain" is required. Examples:
//   niceword.com, 99, buy_now, Brandable, liquidation
//   otherword.io, , make_offer, AI
//   thirdword.net
//
// pricingMode defaults to "buy_now" when a price is given, otherwise
// "make_offer". category defaults to ["Brandable"]. saleType is left
// unset unless you type "liquidation".

const REPO = "dfents/gofetch";
const BRANCH = "main";
const FILE_PATH = "data/domains.json";
const GITHUB_API = "https://api.github.com";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const token = process.env.GITHUB_TOKEN;
  const adminSecret = process.env.ADMIN_SECRET;
  if (!token || !adminSecret) {
    return {
      statusCode: 500,
      body: "Server is not configured yet — GITHUB_TOKEN and/or ADMIN_SECRET are missing from this site's environment variables.",
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON body" };
  }

  if (payload.secret !== adminSecret) {
    return { statusCode: 401, body: "Wrong admin password" };
  }

  const rawRows = String(payload.rows || "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  if (!rawRows.length) {
    return { statusCode: 400, body: "No rows to add" };
  }

  let parsed;
  try {
    parsed = rawRows.map(parseRow);
  } catch (e) {
    return { statusCode: 400, body: "Couldn't parse rows: " + e.message };
  }

  const ghHeaders = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "User-Agent": "gofetch-bulk-add",
  };

  // 1. Fetch the current file (content + sha, needed to update it).
  const getRes = await fetch(
    `${GITHUB_API}/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
    { headers: ghHeaders }
  );
  if (!getRes.ok) {
    return { statusCode: 502, body: "Couldn't read domains.json from GitHub: " + (await getRes.text()) };
  }
  const getJson = await getRes.json();
  const current = JSON.parse(Buffer.from(getJson.content, "base64").toString("utf8"));
  const domains = current.domains || [];

  // 2. Merge: update existing entries by domain (case-insensitive), else append.
  let added = 0, updated = 0;
  for (const row of parsed) {
    const idx = domains.findIndex((d) => d.domain.toLowerCase() === row.domain.toLowerCase());
    if (idx === -1) {
      domains.push(row);
      added++;
    } else {
      domains[idx] = Object.assign({}, domains[idx], row);
      updated++;
    }
  }
  current.domains = domains;

  // 3. Commit the updated file back to GitHub.
  const newContent = Buffer.from(JSON.stringify(current, null, 2) + "\n", "utf8").toString("base64");
  const putRes = await fetch(`${GITHUB_API}/repos/${REPO}/contents/${FILE_PATH}`, {
    method: "PUT",
    headers: ghHeaders,
    body: JSON.stringify({
      message: `Bulk-add via admin tool: ${added} added, ${updated} updated`,
      content: newContent,
      sha: getJson.sha,
      branch: BRANCH,
    }),
  });
  if (!putRes.ok) {
    return { statusCode: 502, body: "Couldn't commit domains.json: " + (await putRes.text()) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ added, updated, total: domains.length }),
  };
};

const VALID_PRICING_MODES = ["buy_now", "make_offer", "private"];
const VALID_SALE_TYPES = ["liquidation"];

function parseRow(line) {
  const parts = line.split(",").map((p) => p.trim());
  const [domainRaw, priceRaw, pricingModeRaw, categoryRaw, saleTypeRaw] = parts;
  if (!domainRaw) throw new Error('missing domain in row: "' + line + '"');
  const domain = domainRaw.toLowerCase();
  const extension = domain.split(".").slice(1).join(".");
  const price = priceRaw ? parseInt(priceRaw.replace(/[^0-9]/g, ""), 10) : null;
  const pricingMode = pricingModeRaw || (price ? "buy_now" : "make_offer");

  // Catches the easy mistake of skipping the price field without leaving its
  // comma in place ("domain, make_offer, AI" instead of "domain, , make_offer,
  // AI") -- without this check, "make_offer" silently becomes the price and
  // "AI" silently becomes the pricingMode, which the site then can't label.
  if (!VALID_PRICING_MODES.includes(pricingMode)) {
    throw new Error(
      'row "' + line + '": "' + pricingMode + '" isn\'t a valid pricing mode ' +
      '(use buy_now, make_offer, or private). If you meant to skip the price ' +
      'field, leave it blank between the commas, e.g. "' + domainRaw + ', , ' + pricingMode + ', <category>"'
    );
  }

  const category = categoryRaw ? categoryRaw.split("|").map((c) => c.trim()).filter(Boolean) : ["Brandable"];
  const saleType = saleTypeRaw ? saleTypeRaw.trim() : undefined;
  if (saleType && !VALID_SALE_TYPES.includes(saleType)) {
    throw new Error('row "' + line + '": "' + saleType + '" isn\'t a recognized sale type (only "liquidation" is supported -- leave it blank otherwise)');
  }

  const record = {
    domain,
    extension,
    logo: "",
    logoVideo: "",
    tagline: "",
    description: "",
    category,
    pricingMode,
    price: price || null,
    featured: false,
    hasLander: true,
  };
  if (saleType) record.saleType = saleType;
  return record;
}
