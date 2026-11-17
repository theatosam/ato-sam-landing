#!/usr/bin/env python
"""Write the latest three Autonomy Architect letters into the hub (index.html).

Tier 2 (standalone + internet): fetches the public Substack feed, resizes each cover to a
640x360 WebP of 40 KB or less under assets/img/, and rewrites the block between the
BEGIN LETTERS / END LETTERS comments in index.html. Standard library plus Pillow.

  python tools/letters_sync.py              # fetch, write, print the newest letter's date
  python tools/letters_sync.py --feed-file feed.xml   # offline: read the feed from a file

Run it by hand after a letter publishes, then commit and push. It prints the newest
letter's date, so a skipped week shows. Nothing here reads credentials or posts anywhere.
"""
from __future__ import annotations

import argparse
import html
import io
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEED = "https://theatosam.substack.com/feed"
UA = "theatosam.com letters sync"
COUNT = 3
COVER_W, COVER_H = 640, 360
MAX_BYTES = 40 * 1024
BEGIN = "<!-- BEGIN LETTERS"
END = "<!-- END LETTERS"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}encoded"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def first_line(content_html: str, limit: int = 180) -> str:
    m = re.search(r"<p>(.*?)</p>", content_html or "", re.S)
    text = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))) if m else ""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    if end > 80:
        return cut[: end + 1]
    return cut[: cut.rfind(" ")].rstrip(",;:") + "..."


def parse(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items = []
    for it in root.iter("item"):
        enc = it.find("enclosure")
        items.append({
            "title": (it.findtext("title") or "").strip(),
            "link": (it.findtext("link") or "").strip(),
            "date": parsedate_to_datetime(it.findtext("pubDate")),
            "line": first_line(it.findtext(CONTENT) or it.findtext("description") or ""),
            "cover": enc.get("url") if enc is not None else None,
        })
    return items[:COUNT]


def save_cover(url: str, dest: Path) -> int:
    from PIL import Image

    img = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    w, h = img.size
    target = COVER_W / COVER_H
    if w / h > target:
        nw = int(h * target)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    for scale in (1.0, 0.85, 0.7):
        size = (int(COVER_W * scale), int(COVER_H * scale))
        small = img.resize(size, Image.LANCZOS)
        for q in range(82, 29, -4):
            buf = io.BytesIO()
            small.save(buf, "WEBP", quality=q, method=6)
            if buf.tell() <= MAX_BYTES:
                dest.write_bytes(buf.getvalue())
                return buf.tell()
    raise SystemExit(f"cover {url} will not fit {MAX_BYTES} bytes")


def esc(s: str) -> str:
    return html.escape(s, quote=False).replace("'", "&rsquo;")


def card(n: int, it: dict, has_cover: bool) -> str:
    d = it["date"]
    date = f"{d.day} {d.strftime('%B %Y')}"
    cover = (f'\n          <div class="cover"><img src="/assets/img/letter-{n}.webp" width="{COVER_W}" height="{COVER_H}" alt="" loading="lazy"></div>'
             if has_cover else "")
    return (f'        <a class="post" href="{html.escape(it["link"], quote=True)}" target="_blank" rel="noopener">{cover}\n'
            f'          <h3>{esc(it["title"])}</h3>\n'
            f'          <p>{esc(it["line"])}</p>\n'
            f'          <span class="go">Read the letter</span>\n'
            f'          <div class="by">Ato Sam<i>&bull;</i>{date}</div>\n'
            f'        </a>\n')


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--feed-file", help="read the feed from this file instead of fetching it")
    ap.add_argument("--page", default=str(ROOT / "index.html"))
    a = ap.parse_args()

    xml_bytes = Path(a.feed_file).read_bytes() if a.feed_file else fetch(FEED)
    items = parse(xml_bytes)
    if len(items) < 1:
        print("feed had no items; nothing written", file=sys.stderr)
        return 1
    img_dir = ROOT / "assets" / "img"
    cards = []
    for n, it in enumerate(items, 1):
        ok = False
        if it["cover"]:
            size = save_cover(it["cover"], img_dir / f"letter-{n}.webp")
            print(f"  cover {n}: {size / 1024:.1f} KB  {it['title'][:50]}")
            ok = True
        cards.append(card(n, it, ok))
    page = Path(a.page)
    t = page.read_text(encoding="utf-8")
    b = t.index(BEGIN)
    b = t.index("\n", b) + 1
    e = t.index(END)
    e = t.rindex("\n", 0, e) + 1
    block = '      <div class="blog">\n' + "".join(cards) + "      </div>\n"
    page.write_text(t[:b] + block + t[e:], encoding="utf-8", newline="\n")
    newest = max(i["date"] for i in items)
    print(f"newest letter: {newest.strftime('%Y-%m-%d')} ({items[0]['title']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
