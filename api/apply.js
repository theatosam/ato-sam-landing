// POST /api/apply: application for a free install. Scores it, writes it to Kit, tags it.
// Everyone joins the kit form (its confirmation email sends the kit); the score and gate stay invisible to the applicant.

const { TAGS, TARGET_COUNTRIES, POINTS, subscribe, clean, validEmail, score, guard } = require("./_kit");

module.exports = async function handler(req, res) {
  const body = guard(req, res);
  if (!body) return;

  const a = {
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    country: clean(body.country, 2).toUpperCase(),
    clients: clean(body.clients, 10),
    situation: clean(body.situation, 10),
    goal: clean(body.goal, 300),
    blocker: clean(body.blocker, 10),
    trying: clean(body.trying, 10),
    priceFair: clean(body.price_fair, 40),
    priceLow: clean(body.price_low, 40),
    priceHigh: clean(body.price_high, 40),
    site: clean(body.site, 300),
    consent: body.consent === "yes",
  };
  const complete =
    a.name && validEmail(a.email) && /^[A-Z]{2}$/.test(a.country) && a.goal &&
    a.clients in POINTS.clients && a.situation in POINTS.situation &&
    a.blocker in POINTS.blocker && a.trying in POINTS.trying;
  if (!complete) return res.status(400).json({ ok: false, error: "missing fields" });

  const qualified = a.consent && TARGET_COUNTRIES.includes(a.country);
  const fields = {
    "Country": a.country,
    "Active clients": a.clients,
    "Situation": a.situation,
    "90-day goal": a.goal,
    "Blocker": a.blocker,
    "Trying now": a.trying,
    "Price fair": a.priceFair,
    "Price too low": a.priceLow,
    "Price too high": a.priceHigh,
    "Website": a.site,
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
