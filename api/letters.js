// GET /api/letters: the latest Autonomy Architect letters from the Substack feed, cached at the edge for an hour.

const FEED = "https://theatosam.substack.com/feed";
const MAX = 6;

function tag(item, name) {
  const m = item.match(new RegExp("<" + name + ">(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</" + name + ">"));
  return m ? m[1].trim() : "";
}

function parse(xml) {
  return (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, MAX).map((item) => {
    const img = item.match(/<enclosure url="([^"]+)"/);
    return {
      title: tag(item, "title"),
      description: tag(item, "description"),
      link: tag(item, "link"),
      date: new Date(tag(item, "pubDate")).toISOString().slice(0, 10),
      image: img ? img[1] : null,
    };
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }
  try {
    const r = await fetch(FEED, { headers: { "User-Agent": "theatosam.com letters" } });
    if (!r.ok) throw new Error("feed " + r.status);
    const letters = parse(await r.text());
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ ok: true, letters });
  } catch (err) {
    console.error(err);
    res.status(502).json({ ok: false });
  }
};
