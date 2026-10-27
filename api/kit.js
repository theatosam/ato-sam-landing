// POST /api/kit: "just want the starter kit?" form. Adds the email to Kit with the "starter-kit" tag.

const { TAGS, subscribe, clean, validEmail, guard } = require("./_kit");

module.exports = async function handler(req, res) {
  const body = guard(req, res);
  if (!body) return;

  const email = clean(body.email, 200).toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ ok: false, error: "email" });

  try {
    await subscribe(email, "", null, [TAGS.kit]);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ ok: false });
  }
};
