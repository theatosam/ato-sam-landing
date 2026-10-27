// POST /api/apply: application for a free install. Scores it, writes it to Kit, tags it.
// Everyone gets the "starter-kit" tag (the kit email); the score and gate stay invisible to the applicant.

const { TAGS, TARGET_COUNTRIES, POINTS, subscribe, clean, validEmail, score, guard } = require("./_kit");

module.exports = async function handler(req, res) {
  const body = guard(req, res);
  if (!body) return;

  const a = {
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    country: clean(body.country, 2).toUpperCase(),
    clients: clean(body.clients, 10),
    hours: clean(body.hours, 10),
    ai: clean(body.ai, 10),
    site: clean(body.site, 300),
    why: clean(body.why, 500),
    consent: body.consent === "yes",
  };
  const complete =
    a.name && validEmail(a.email) && /^[A-Z]{2}$/.test(a.country) &&
    a.clients in POINTS.clients && a.hours in POINTS.hours && a.ai in POINTS.ai;
  if (!complete) return res.status(400).json({ ok: false, error: "missing fields" });

  const qualified = a.consent && TARGET_COUNTRIES.includes(a.country);
  const fields = {
    "Country": a.country,
    "Active clients": a.clients,
    "Admin hours": a.hours,
    "Paid AI": a.ai,
    "Website": a.site,
    "Why now": a.why,
    "Score": qualified ? score(a) : 0,
    "Applied": new Date().toISOString().slice(0, 10),
  };

  try {
    await subscribe(a.email, a.name.split(/\s+/)[0], fields, [TAGS.kit, qualified ? TAGS.qualified : TAGS.listOnly]);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ ok: false });
  }
};
