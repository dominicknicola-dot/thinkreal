#!/usr/bin/env python3
"""Build v3 — Think Real, the page as scenes.

Assembles five self-contained deployable pages from shared parts:
  index.html · cyprus.html · greece.html · middleeast.html · contact.html

...and one hash-routed single file for the claude.ai Artifact preview:
  artifact.html                              (nav links = #/, #/cyprus, ...)

Imagery comes from ./media, which holds graded WebP variants generated once
from ../assets/opt (the grade is baked in, so no CSS filter runs at scroll
time). media/manifest.json records each variant's real pixel size, which is
what lets every <img> carry width/height and reserve its own space.

One stylesheet, one vendor script (Motion, motion.dev, MIT) and one script of
our own. Motion owns the opening and every entrance; the scroll-linked parallax
stays on a single rAF loop in main.js.
"""
import base64
import datetime
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).parent
MEDIA = ROOT / "media"

# ---------------------------------------------------------------------------
# Paste your Formspree form id here (create a free form pointed at
# info@think.cy at https://formspree.io — the id looks like "xldeabcd").
# Leave as-is and the form falls back to opening a pre-filled email.
FORMSPREE_ID = "xeaqaddq"
# ---------------------------------------------------------------------------

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com" />'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />'
    # the latin subset carries every glyph on the site; preloading it lets the
    # first paint use the real face instead of swapping in after layout
    '<link rel="preload" as="font" type="font/woff2" crossorigin '
    'href="https://fonts.gstatic.com/s/intertight/v9/NGSwv5HMAFg6IuGlBNMjxLsH8ahuQ2e8.woff2" />'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
    'family=Inter+Tight:wght@400;500&display=swap" />'
)

# order here is the build + route order
PAGES = {
    "index": {
        "body": "index.body.html", "route": "home", "hero": "hero",
        "title": "thinkReal · Real Estate Investment Consultancy in Cyprus, Greece and the Middle East",
        "desc": "Think Real is a real estate investment consultancy in Cyprus, Greece and the Middle East, publishing residential prices and gross yields by district and community.",
        "nav": {},
    },
    "cyprus": {
        "body": "cyprus.body.html", "route": "cyprus", "hero": "cyprus",
        "title": "Cyprus · thinkReal",
        "desc": "Cyprus property prices and gross yields by district: Limassol, Paphos, Larnaca and Nicosia.",
        "nav": {"cyprus": True},
    },
    "greece": {
        "body": "greece.body.html", "route": "greece", "hero": "greecegate",
        "title": "Greece · thinkReal",
        "desc": "Greece property prices and gross yields: Athens, Thessaloniki and the Cyclades.",
        "nav": {"greece": True},
    },
    "middleeast": {
        "body": "middleeast.body.html", "route": "middleeast", "hero": "middleeast",
        "title": "Middle East · thinkReal",
        "desc": "Dubai property prices and gross yields by community: Downtown, Dubai Marina, Palm Jumeirah and Jumeirah Village Circle.",
        "nav": {"middleeast": True},
    },
    "contact": {
        "body": "contact.body.html", "route": "contact", "hero": None,
        "title": "Contact · thinkReal",
        "desc": "Contact Think Real. Louki Akrita 8, Office 202, 3030 Limassol, Cyprus. +357 25 107 444, info@think.cy.",
        "nav": {"contact": True},
    },
}

LINK_KEYS = ("home", "cyprus", "greece", "middleeast", "contact")

# ---------------------------------------------------------------------------
# The machine-readable half of the site.
#
# Everything below describes the same practice the pages describe, to anything
# reading without eyes: a search engine's parser, or an agent. One source for
# both, so the structured data cannot drift away from the prose.
#
# The apex 308-redirects to www, so www is canonical and every emitted URL is
# absolute against it. A relative link in llms.txt or a sitemap is a link an
# agent has to guess at.
SITE = {
    "base": "https://www.think.cy",
    "name": "Think Real",
    "legal": "Think Real",
    "phone": "+357 25 107 444",
    "mobile": "+357 99 344 457",
    "email": "info@think.cy",
    "street": "Louki Akrita 8, Office 202",
    "locality": "Limassol",
    "postal": "3030",
    "country": "CY",
    "sameAs": [
        "https://www.facebook.com/profile.php?id=61574844717417",
        "https://www.linkedin.com/in/dominick-nicola-558725b0/",
    ],
    "areas": ["Cyprus", "Greece", "United Arab Emirates"],
}

# What an agent should come here for, in its own words. Vague marketing copy
# reads as noise to a caller deciding whether this site answers its question,
# so each line names a job and the page that does it.
AGENT_JOBS = [
    ("Compare residential prices and gross yields across Cyprus, Greece and Dubai",
     "Per district and per community, with the date the figures were taken.",
     ["cyprus", "greece", "middleeast"]),
    ("Find what a square metre costs in a named market",
     "Limassol, Paphos, Larnaca, Nicosia, Athens, Thessaloniki, the Cyclades, "
     "Downtown Dubai, Dubai Marina, Palm Jumeirah, Jumeirah Village Circle.",
     ["cyprus", "greece", "middleeast"]),
    ("Reach a consultancy that works across all three markets",
     "Office address, telephone and a contact form that reaches the practice.",
     ["contact"]),
]

AGENT_NOT_FOR = [
    "Live listings or an inventory feed. The site carries market figures, not stock.",
    "Valuations of a specific property. That is what the consultation is for.",
    "Legal, tax or investment advice. Figures are published as market context only.",
]

# The counted arrival. It sits on every page, is inert without script, and is
# removed by main.js once the bands have cleared (or on the first gesture).
# Six bands, not one panel: they clear left to right, top band first, so the
# page is uncovered on a diagonal rather than swapped in behind one curtain.
PRELOADER = ('<div class="pre" id="pre" data-theme="dark" aria-hidden="true">'
             '<div class="pre__bands" id="preBands">'
             '<i></i><i></i><i></i><i></i><i></i><i></i>'
             '</div>'
             '<div class="pre__foot" id="preFoot">'
             '<span class="pre__n" id="preN">00</span>'
             '<span class="pre__rule" id="preRule"></span>'
             '</div></div>')


def manifest() -> dict:
    path = MEDIA / "manifest.json"
    if not path.exists():
        print("MISSING media/manifest.json — generate the image variants first.")
        sys.exit(1)
    return json.loads(path.read_text())


MAN = manifest()


def variants(key: str):
    """Every generated size for one image, smallest first: (w, h, filename)."""
    if key not in MAN:
        print("UNKNOWN IMAGE KEY:", key)
        sys.exit(1)
    return sorted([(v[0], v[1], v[2]) for v in MAN[key]["v"]])


def data_uri(name: str) -> str:
    path = MEDIA / name
    if not path.exists():
        print("MISSING MEDIA FILE:", name)
        sys.exit(1)
    return "data:image/webp;base64," + base64.b64encode(path.read_bytes()).decode()


def pic_attrs(key: str, sizes: str, inline: bool) -> str:
    """src/srcset/sizes plus the real width and height, so the box is reserved
    before the bytes arrive and nothing shifts.

    data-k carries the manifest key onto the element. The hero scrim is set per
    photograph, and this is what keeps that rule tied to the picture it was
    measured against instead of to a name typed twice."""
    vs = variants(key)
    w, h, name = vs[-1]
    if inline:
        # the artifact is one file under a 16 MB ceiling: one size, inlined
        return f'data-k="{key}" src="{data_uri(name)}" width="{w}" height="{h}"'
    srcset = ", ".join(f"media/{n} {vw}w" for vw, _vh, n in vs)
    return (f'data-k="{key}" src="media/{name}" srcset="{srcset}" '
            f'sizes="{sizes}" width="{w}" height="{h}"')


def resolve_pics(text: str, inline: bool) -> str:
    def repl(m):
        return pic_attrs(m.group(1), m.group(2).strip(), inline)
    return re.sub(r"\{\{PIC:([a-z]+)\|([^}]+)\}\}", repl, text)


def preload_for(key: str) -> str:
    """The hero is the largest contentful paint on every page that has one."""
    if not key:
        return ""
    vs = variants(key)
    w, _h, name = vs[-1]
    srcset = ", ".join(f"media/{n} {vw}w" for vw, _vh, n in vs)
    return (f'<link rel="preload" as="image" href="media/{name}" '
            f'imagesrcset="{srcset}" imagesizes="100vw" fetchpriority="high" />')


def apply_links(text: str, links: dict) -> str:
    for k in LINK_KEYS:
        text = text.replace("{{" + k.upper() + "}}", links[k])
    return text


def nav_for(links: dict, current: dict) -> str:
    nav = apply_links((ROOT / "parts" / "nav.html").read_text(), links)
    for k in ("cyprus", "greece", "middleeast", "contact"):
        tok = "{{NAV_" + k.upper() + "}}"
        nav = nav.replace(tok, ' aria-current="page"' if current.get(k) else "")
    return nav


def footer_for(links: dict) -> str:
    return apply_links((ROOT / "parts" / "footer.html").read_text(), links)


def page_body(name: str, links: dict, formspree: str) -> str:
    body = apply_links((ROOT / "pages" / PAGES[name]["body"]).read_text(), links)
    return body.replace("{{FORMSPREE}}", formspree)


def rewrite_main(body: str) -> str:
    """Turn the page's <main id="main" ...> into a route <div>, folding any
    classes it already carries into the new class attribute."""
    m = re.search(r'<main\s+id="main"([^>]*)>', body)
    if not m:
        return body
    attrs = m.group(1)
    cls = re.search(r'\bclass="([^"]*)"', attrs)
    extra = (" " + cls.group(1)) if cls else ""
    rest = re.sub(r'\s*\bclass="[^"]*"', "", attrs)
    return body[:m.start()] + f'<div class="route-main{extra}"{rest}>' + body[m.end():]


def dedupe_artifact_images(html: str) -> str:
    """The SPA inlines the same photo on several routes. Keep one copy of each
    data URI, tag the rest, and let a tiny script fill them in on load."""
    order: list[str] = []
    for m in re.finditer(r'src="(data:image/[^"]+)"', html):
        if m.group(1) not in order:
            order.append(m.group(1))
    if len(order) < 2:
        return html
    idx = {u: i for i, u in enumerate(order)}
    seen: set[str] = set()

    def repl(m: "re.Match[str]") -> str:
        u = m.group(1)
        i = idx[u]
        if u not in seen:
            seen.add(u)
            return f'src="{u}" data-tr-src="{i}"'
        return f'data-tr-img="{i}"'

    html = re.sub(r'src="(data:image/[^"]+)"', repl, html)
    script = (
        "<script>(function(){var m={};"
        'document.querySelectorAll("[data-tr-src]").forEach(function(e){m[e.getAttribute("data-tr-src")]=e.getAttribute("src");});'
        'document.querySelectorAll("[data-tr-img]").forEach(function(e){var s=m[e.getAttribute("data-tr-img")];if(s){e.src=s;}});'
        "})();</script>"
    )
    return html + "\n" + script


def document(head_extra: str, title: str, desc: str, css: str, body_html: str,
             body_attr: str = "", full_doc: bool = True) -> str:
    head = (
        f"<title>{title}</title>\n"
        '<meta charset="utf-8" />\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        # Set the js class before first paint, so content that will reveal is
        # hidden from the start instead of painting, hiding, then revealing.
        # If main.js has not marked itself ready within 3s, reveal everything.
        '<script>(function(d){d.classList.remove("no-js");d.classList.add("js");'
        'setTimeout(function(){if(!window.__trReady)d.classList.add("reveal-all");},3000);'
        '})(document.documentElement);</script>\n'
        f'<meta name="description" content="{desc}" />\n'
        '<meta name="theme-color" content="#0B0B0C" />\n'
        f"{FONTS}\n{head_extra}\n"
        f"<style>\n{css}\n</style>"
    )
    if not full_doc:  # artifact fragment: no doctype/html/head/body wrappers
        return head + "\n" + body_html
    return (
        "<!doctype html>\n"
        f'<html lang="en" class="no-js">\n<head>\n{head}\n</head>\n'
        f"<body{(' ' + body_attr) if body_attr else ''}>\n{body_html}\n</body>\n</html>\n"
    )


def jsonld(name: str, cfg: dict) -> str:
    """One RealEstateAgent node, repeated on every page with the page's own url.

    RealEstateAgent rather than Organization: it is a LocalBusiness subtype, so
    a parser gets the postal address and telephone as well as the identity, and
    it says what the practice does rather than only that it exists."""
    node = {
        "@context": "https://schema.org",
        "@type": "RealEstateAgent",
        "@id": f"{SITE['base']}/#practice",
        "name": SITE["name"],
        "url": f"{SITE['base']}/" if name == "index" else f"{SITE['base']}/{name}.html",
        "description": cfg["desc"],
        "email": SITE["email"],
        "telephone": SITE["phone"],
        "address": {
            "@type": "PostalAddress",
            "streetAddress": SITE["street"],
            "addressLocality": SITE["locality"],
            "postalCode": SITE["postal"],
            "addressCountry": SITE["country"],
        },
        "areaServed": [{"@type": "Place", "name": a} for a in SITE["areas"]],
        "sameAs": SITE["sameAs"],
    }
    return ('<script type="application/ld+json">'
            + json.dumps(node, ensure_ascii=False, separators=(",", ":"))
            + "</script>")


class _Markdown(HTMLParser):
    """The page's own body, as Markdown.

    Not a general converter: it handles the tags these pages actually use and
    ignores the rest. The reveal spans are unwrapped, because a <span> per
    headline line is a rendering device and means nothing to a reader."""

    SKIP = {"script", "style", "button", "form", "input", "textarea", "svg", "nav"}
    HEAD = {"h1": "# ", "h2": "## ", "h3": "### "}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.buf: list[str] = []
        self.skip = 0
        self.prefix = ""

    def _flush(self) -> None:
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if text:
            self.out.append(self.prefix + text)
        self.prefix = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.SKIP:
            self.skip += 1
            return
        if self.skip:
            return
        if tag in self.HEAD:
            self._flush()
            self.prefix = self.HEAD[tag]
        elif tag in ("p", "dd", "figcaption", "address"):
            self._flush()
        elif tag == "dt":
            self._flush()
            self.prefix = "**"
        elif tag == "li":
            self._flush()
            self.prefix = "- "
        elif tag == "img" and a.get("alt"):
            self._flush()
            self.out.append(f"![{a['alt']}]({a.get('src', '')})")

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag == "dt":
            text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
            self.buf = []
            if text:
                self.out.append(f"**{text}**")
            self.prefix = ""
        elif tag in self.HEAD or tag in ("p", "dd", "li", "figcaption", "address"):
            self._flush()

    def handle_data(self, data):
        if not self.skip:
            self.buf.append(data)

    def text(self) -> str:
        self._flush()
        lines, prev = [], ""
        for line in self.out:
            if line != prev:  # the swap labels print their own duplicate
                lines.append(line)
            prev = line
        return "\n\n".join(lines)


def markdown_page(name: str, cfg: dict, body_html: str) -> str:
    """Title, description, the body, then where else to go. An agent that
    lands here should not have to fetch a second file to find the rest."""
    p = _Markdown()
    p.feed(body_html)
    text = p.text()
    # media paths are relative on the page and have to be absolute here: a
    # reader that fetched this over Accept has no base to resolve them against
    text = text.replace("](media/", f"]({SITE['base']}/media/")
    # the hero heading repeats the title this file already opens with
    head = f"# {cfg['title'].split(' · ')[0]}"
    text = re.sub(r"(?m)^" + re.escape(head) + r"$\n\n", "", text, count=1)
    others = [f"- [{PAGES[k]['title'].split(' · ')[0]}]({SITE['base']}/"
              f"{'' if k == 'index' else k + '.html'})"
              for k in PAGES if k != name]
    return (
        f"# {cfg['title'].split(' · ')[0]}\n\n"
        f"> {cfg['desc']}\n\n"
        f"Source: {SITE['base']}/{'' if name == 'index' else name + '.html'}\n\n"
        "---\n\n"
        f"{text}\n\n"
        "---\n\n"
        "## Elsewhere on this site\n\n"
        + "\n".join(others)
        + f"\n\n## Contact\n\n{SITE['name']}, {SITE['street']}, {SITE['postal']} "
          f"{SITE['locality']}, Cyprus. {SITE['phone']}. {SITE['email']}\n"
    )


def llms_txt() -> str:
    """The when-to-use file. It says what this site answers, what it does not,
    and how to ask for Markdown, which is the part most of these files omit."""
    jobs = "\n".join(
        f"- **{job}.** {why} See "
        + ", ".join(f"[{PAGES[p]['title'].split(' · ')[0]}]({SITE['base']}/"
                    f"{'' if p == 'index' else p + '.html'})" for p in pages)
        + "."
        for job, why, pages in AGENT_JOBS
    )
    not_for = "\n".join(f"- {line}" for line in AGENT_NOT_FOR)
    pages = "\n".join(
        f"- [{cfg['title'].split(' · ')[0]}]({SITE['base']}/"
        f"{'' if k == 'index' else k + '.html'}): {cfg['desc']}"
        for k, cfg in PAGES.items()
    )
    return f"""# {SITE['name']}

> A real estate investment consultancy working in Cyprus, Greece and the
> Middle East, based in Limassol. The site publishes residential prices and
> gross yields for the districts and communities it covers.

## When to use this site

{jobs}

## When not to use this site

{not_for}

## How to read it

Every page is available as Markdown. Request it with an Accept header:

```
curl -H 'Accept: text/markdown' {SITE['base']}/
```

The same page is also at its own .md address, for example
{SITE['base']}/index.md and {SITE['base']}/cyprus.md.

Figures carry the month they were taken. They are market averages, not
valuations of any particular property.

## Pages

{pages}

## Contact

{SITE['name']}, {SITE['street']}, {SITE['postal']} {SITE['locality']}, Cyprus.
Telephone {SITE['phone']}. Email {SITE['email']}.
"""


def robots_txt() -> str:
    return (
        "User-agent: *\n"
        "Allow: /\n\n"
        f"Sitemap: {SITE['base']}/sitemap.xml\n"
    )


def sitemap_xml() -> str:
    today = datetime.date.today().isoformat()
    urls = "".join(
        f"<url><loc>{SITE['base']}/{'' if k == 'index' else k + '.html'}</loc>"
        f"<lastmod>{today}</lastmod></url>"
        for k in PAGES
    )
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f"{urls}</urlset>\n")


def md_function(pages_md: dict) -> str:
    """Content negotiation, as a function rather than a rewrite.

    A rewrite can serve a Markdown file but it serves it with the status of the
    file it found, so an unknown path would answer 200 and lose the one thing
    the 404 already got right. A function can send 404 and a Markdown body in
    the same response. The Markdown is inlined at build time so the function
    touches no filesystem."""
    table = json.dumps(pages_md, ensure_ascii=False)
    miss = (
        "# 404 Not Found\n\n"
        "No page exists at this address on " + SITE["base"] + ".\n\n"
        "This site publishes residential property prices and gross yields for "
        "Cyprus, Greece and the Middle East. To find what you were looking for, "
        "read " + SITE["base"] + "/llms.txt for what the site covers and when to "
        "use it, or " + SITE["base"] + "/sitemap.xml for every page.\n\n"
        "- [Home](" + SITE["base"] + "/)\n"
        "- [llms.txt](" + SITE["base"] + "/llms.txt)\n"
        "- [Sitemap](" + SITE["base"] + "/sitemap.xml)\n"
    )
    return (
        "// Generated by build.py. Serves Markdown to agents that ask for it.\n"
        "// Mapped from " + SITE["base"] + " by vercel.json, which routes here\n"
        "// only when the Accept header names text/markdown.\n"
        f"const PAGES = {table};\n"
        f"const MISSING = {json.dumps(miss)};\n\n"
        "module.exports = (req, res) => {\n"
        "  const raw = (req.query && req.query.p) || req.url || '/';\n"
        "  let path = String(raw).split('?')[0];\n"
        "  if (!path.startsWith('/')) path = '/' + path;\n"
        "  if (path === '/' || path === '/index.html' || path === '/index.md') path = '/';\n"
        "  else path = path.replace(/\\.(html|md)$/, '');\n"
        "  const body = PAGES[path];\n"
        "  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');\n"
        "  res.setHeader('Vary', 'Accept');\n"
        "  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');\n"
        "  if (body) { res.statusCode = 200; res.end(body); return; }\n"
        "  res.statusCode = 404;\n"
        "  res.end(MISSING);\n"
        "};\n"
    )


def vercel_json() -> str:
    """Only requests that name text/markdown reach the function. A browser's
    Accept header lists text/html and */*, never text/markdown, so the pages
    themselves are untouched by this."""
    cfg = {
        "rewrites": [{
            "source": "/((?!api/).*)",
            "has": [{"type": "header", "key": "accept", "value": ".*text/markdown.*"}],
            "destination": "/api/md?p=/$1",
        }],
        "headers": [{
            "source": "/((?!media/).*)",
            "headers": [{"key": "Vary", "value": "Accept"}],
        }],
    }
    return json.dumps(cfg, indent=2) + "\n"


def main() -> None:
    css = (ROOT / "css" / "style.css").read_text()
    mainjs = (ROOT / "js" / "main.js").read_text()
    # Motion (motion.dev) drives every entrance and the opening. It is inlined
    # rather than linked so a page stays one file: the artifact has no second
    # request available to it, and the deployable pages keep working from disk.
    motionjs = (ROOT / "vendor" / "motion.min.js").read_text()
    scripts = f"<script>\n{motionjs}\n</script>\n<script>\n{mainjs}\n</script>"
    formspree = f"https://formspree.io/f/{FORMSPREE_ID}"

    # ---- deployable multi-page build -------------------------------------
    page_links = {
        "home": "index.html", "cyprus": "cyprus.html", "greece": "greece.html",
        "middleeast": "middleeast.html", "contact": "contact.html",
    }
    pages_md = {}
    for name, cfg in PAGES.items():
        nav = nav_for(page_links, cfg["nav"])
        ft = footer_for(page_links)
        body = page_body(name, page_links, formspree)
        resolved = resolve_pics(body, inline=False)
        html = document(
            preload_for(cfg["hero"]) + "\n" + jsonld(name, cfg),
            cfg["title"], cfg["desc"], css,
            f"{PRELOADER}\n{nav}\n{resolved}\n{ft}\n{scripts}",
            body_attr="", full_doc=True,
        )
        out = ROOT / f"{name}.html"
        out.write_text(html)
        print(f"wrote {out.name:16s} {len(html)/1024:6.0f} KB")

        # the same page, for a reader without eyes
        md = markdown_page(name, cfg, resolved)
        (ROOT / f"{name}.md").write_text(md)
        pages_md["/" if name == "index" else f"/{name}"] = md

    # ---- the machine-readable half ---------------------------------------
    (ROOT / "llms.txt").write_text(llms_txt())
    (ROOT / "robots.txt").write_text(robots_txt())
    (ROOT / "sitemap.xml").write_text(sitemap_xml())
    (ROOT / "vercel.json").write_text(vercel_json())
    api = ROOT / "api"
    api.mkdir(exist_ok=True)
    (api / "md.js").write_text(md_function(pages_md))
    print(f"wrote {'llms.txt':16s} {len(llms_txt())/1024:6.1f} KB"
          f"   + robots.txt, sitemap.xml, vercel.json, api/md.js, "
          f"{len(pages_md)} .md pages")

    # ---- hash-routed single-file artifact -------------------------------
    spa_links = {
        "home": "#/", "cyprus": "#/cyprus", "greece": "#/greece",
        "middleeast": "#/middleeast", "contact": "#/contact",
    }
    nav = nav_for(spa_links, {})
    ft = footer_for(spa_links)
    routes = []
    for name, cfg in PAGES.items():
        route = cfg["route"]
        body = page_body(name, spa_links, formspree)
        # Neutralise the single <main id="main"> so ids stay unique across
        # routes. The page's own classes must be MERGED into the new class
        # attribute — emitting a second class="" silently drops it.
        body = rewrite_main(body)
        body = re.sub(r"</main>\s*$", "</div>", body.rstrip(), count=1)
        hidden = "" if route == "home" else " hidden"
        routes.append(f'<div class="route" data-route="{route}"{hidden}>\n{resolve_pics(body, inline=True)}\n</div>')
    spa_body = f"{PRELOADER}\n{nav}\n" + "\n".join(routes) + f"\n{ft}\n{scripts}"
    artifact = document(
        "", "thinkReal", PAGES["index"]["desc"], css, spa_body,
        body_attr='data-spa="1"', full_doc=False,
    )
    artifact = dedupe_artifact_images(artifact)
    (ROOT / "artifact.html").write_text(artifact)
    print(f"wrote {'artifact.html':16s} {len(artifact)/1024:6.0f} KB")

    # guard: a duplicate class attribute silently drops styling, so never ship one
    dupes = re.findall(r'<[a-zA-Z][^>]*\bclass="[^"]*"[^>]*\bclass="', artifact)
    if dupes:
        print(f"ERROR: {len(dupes)} element(s) carry a duplicate class attribute.")
        sys.exit(1)

    if FORMSPREE_ID == "REPLACE_WITH_FORMSPREE_ID":
        print("\nNOTE: FORMSPREE_ID not set — the contact form falls back to a pre-filled mailto.")


if __name__ == "__main__":
    main()
