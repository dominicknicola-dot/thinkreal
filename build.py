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
import json
import pathlib
import re
import sys

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
        "title": "thinkReal · Intelligent Investment. Inspired Living.",
        "desc": "Think Real is a Cyprus-based investment consultancy for real estate across Cyprus, Greece and the Middle East.",
        "nav": {},
    },
    "cyprus": {
        "body": "cyprus.body.html", "route": "cyprus", "hero": "cyprus",
        "title": "Cyprus · thinkReal",
        "desc": "Cyprus: home base for Think Real. Seafront residences and commercial assets, in an EU member state on the euro.",
        "nav": {"cyprus": True},
    },
    "greece": {
        "body": "greece.body.html", "route": "greece", "hero": "greecegate",
        "title": "Greece · thinkReal",
        "desc": "Greece: coastal property with enduring lifestyle appeal, across the mainland and the islands.",
        "nav": {"greece": True},
    },
    "middleeast": {
        "body": "middleeast.body.html", "route": "middleeast", "hero": "middleeast",
        "title": "Middle East · thinkReal",
        "desc": "The Middle East: metropolitan markets where growth and lifestyle continue to converge.",
        "nav": {"middleeast": True},
    },
    "contact": {
        "body": "contact.body.html", "route": "contact", "hero": None,
        "title": "Contact · thinkReal",
        "desc": "Begin with a conversation about your objectives. Think Real, Limassol, Cyprus.",
        "nav": {"contact": True},
    },
}

LINK_KEYS = ("home", "cyprus", "greece", "middleeast", "contact")

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
    for name, cfg in PAGES.items():
        nav = nav_for(page_links, cfg["nav"])
        ft = footer_for(page_links)
        body = page_body(name, page_links, formspree)
        html = document(
            preload_for(cfg["hero"]), cfg["title"], cfg["desc"], css,
            f"{PRELOADER}\n{nav}\n{resolve_pics(body, inline=False)}\n{ft}\n{scripts}",
            body_attr="", full_doc=True,
        )
        out = ROOT / f"{name}.html"
        out.write_text(html)
        print(f"wrote {out.name:16s} {len(html)/1024:6.0f} KB")

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
