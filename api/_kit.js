// Shared helpers for the /api functions: Kit (kit.com) v4 calls, validation, scoring.
// Files starting with "_" are not deployed as functions.

const KIT = "https://api.kit.com/v4";

// "Starter kit" form. Its confirmation (double opt-in) email delivers the kit; the free plan has no automations.
const FORM_ID = 10104292;

// Tags are looked up by name and created if missing, so Kit needs no manual setup.
// "starter-kit" marks who asked for the kit; the form, not the tag, sends it.
const TAGS = {
  kit: "starter-kit",
  qualified: "applicant-qualified",
  listOnly: "applicant-list-only",
};

// Custom field labels, in the order Ato reads them in Kit.
const FIELDS = ["Country", "Active clients", "Admin hours", "Paid AI", "Website", "Why now", "Score", "Applied"];

// Gate: where the outreach runs (context/current-priorities.md). Anyone else gets the kit and the list.
const TARGET_COUNTRIES = ["US", "CA", "AU", "NZ", "GB", "IE"];

const POINTS = {
  clients: { "0": 0, "1-2": 1, "3-5": 2, "6+": 3 },
  hours: { "under-3": 0, "3-5": 1, "6-10": 2, "10+": 3 },
  ai: { none: 0, chatgpt: 1, other: 1, claude: 2 },
};

let tagIds = null;
let fieldKeys = null;

async function kit(path, method = "GET", body) {
  const key = process.env.KIT_API_KEY;
  if (!key) throw new Error("KIT_API_KEY not set");
  const res = await fetch(KIT + path, {
    method,
    headers: { "X-Kit-Api-Key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Kit ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

async function ensureTags() {
  if (tagIds) return tagIds;
  const { tags } = await kit("/tags?per_page=1000");
  const byName = Object.fromEntries(tags.map((t) => [t.name, t.id]));
  for (const name of Object.values(TAGS)) {
    if (!byName[name]) byName[name] = (await kit("/tags", "POST", { name })).tag.id;
  }
  tagIds = byName;
  return tagIds;
}

async function ensureFields() {
  if (fieldKeys) return fieldKeys;
  const { custom_fields } = await kit("/custom_fields?per_page=1000");
  const byLabel = Object.fromEntries(custom_fields.map((f) => [f.label, f.key]));
  for (const label of FIELDS) {
    if (!byLabel[label]) byLabel[label] = (await kit("/custom_fields", "POST", { label })).custom_field.key;
  }
  fieldKeys = byLabel;
  return fieldKeys;
}

// Create the subscriber as inactive, add them to the form (Kit sends the confirmation email with the kit),
// then apply each tag. Order matters: an "active" subscriber gets no confirmation email.
// An existing subscriber keeps their state; Kit only updates name and fields.
async function subscribe(email, firstName, fields, tagNames) {
  const body = { email_address: email, state: "inactive" };
  if (firstName) body.first_name = firstName;
  if (fields) {
    const keys = await ensureFields();
    body.fields = Object.fromEntries(Object.entries(fields).map(([label, v]) => [keys[label], String(v)]));
  }
  await kit("/subscribers", "POST", body);
  await kit(`/forms/${FORM_ID}/subscribers`, "POST", { email_address: email, referrer: "https://theatosam.com/autonomous-mode/apply" });
  const ids = await ensureTags();
  for (const name of tagNames) {
    await kit(`/tags/${ids[name]}/subscribers`, "POST", { email_address: email });
  }
}

function clean(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

// Auto score, max 9. "Why now" (0-2) is scored by hand, so the full scale is 11.
function score(a) {
  return (POINTS.clients[a.clients] ?? 0) + (POINTS.hours[a.hours] ?? 0) + (POINTS.ai[a.ai] ?? 0) + (a.site ? 1 : 0);
}

// Shared request guard: POST only, same site, honeypot. Returns the body, or null when already answered.
function guard(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false });
    return null;
  }
  const origin = req.headers.origin || "";
  if (origin && !/^https:\/\/(www\.)?theatosam\.com$|^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.status(403).json({ ok: false });
    return null;
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (body.company) {
    res.status(200).json({ ok: true }); // bot filled the honeypot; say nothing
    return null;
  }
  return body;
}

module.exports = { TAGS, TARGET_COUNTRIES, POINTS, subscribe, clean, validEmail, score, guard };
