#!/usr/bin/env python3
"""Checks the machine-readable half of the site, the half nobody looks at.

Run after build.py. Everything here is an assertion about a file the build
emitted, plus one real execution of the Markdown function under node, because
a negotiation endpoint that is only reasoned about is not a tested one.

    python3 check_agents.py
"""
import json
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).parent
BASE = "https://www.think.cy"
PAGE_NAMES = ["index", "cyprus", "greece", "middleeast", "contact"]
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  ok    {label}")
    else:
        print(f"  FAIL  {label}" + (f" :: {detail}" if detail else ""))
        failures.append(label)


print("JSON-LD on every page")
for name in PAGE_NAMES:
    html = (ROOT / f"{name}.html").read_text()
    blocks = re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    check(f"{name}.html has exactly one JSON-LD block", len(blocks) == 1,
          f"found {len(blocks)}")
    if not blocks:
        continue
    try:
        node = json.loads(blocks[0])
    except json.JSONDecodeError as e:
        check(f"{name}.html JSON-LD parses", False, str(e))
        continue
    check(f"{name}.html JSON-LD parses", True)
    for field in ("@context", "@type", "name", "description", "url", "address"):
        check(f"{name}.html JSON-LD has {field}", field in node)
    check(f"{name}.html JSON-LD url is absolute",
          str(node.get("url", "")).startswith(BASE))
    check(f"{name}.html JSON-LD address is a PostalAddress",
          node.get("address", {}).get("@type") == "PostalAddress")

print("\nMarkdown twin for every page")
for name in PAGE_NAMES:
    md = ROOT / f"{name}.md"
    check(f"{name}.md exists", md.exists())
    if not md.exists():
        continue
    text = md.read_text()
    check(f"{name}.md opens with a heading", text.startswith("# "))
    check(f"{name}.md cites its source URL", f"Source: {BASE}/" in text)
    check(f"{name}.md carries contact details", "info@think.cy" in text)
    check(f"{name}.md has no relative media paths", "](media/" not in text)
    check(f"{name}.md has no unresolved template token", "{{PIC:" not in text)
    check(f"{name}.md is substantial", len(text) > 400, f"{len(text)} chars")
    check(f"{name}.md carries no em or en dash",
          "—" not in text and "–" not in text)

print("\nllms.txt")
llms = (ROOT / "llms.txt").read_text()
check("llms.txt exists and is non-empty", len(llms) > 200)
check("llms.txt has a when-to-use section",
      re.search(r"(?mi)^##\s*When to use", llms) is not None)
check("llms.txt says when NOT to use the site",
      re.search(r"(?mi)^##\s*When not to use", llms) is not None)
check("llms.txt names concrete markets",
      all(m in llms for m in ("Limassol", "Athens", "Dubai Marina")))
check("llms.txt explains the Accept header", "Accept: text/markdown" in llms)
check("llms.txt links every page",
      all(f"{BASE}/{'' if n == 'index' else n + '.html'}" in llms
          for n in PAGE_NAMES))

print("\nrobots.txt and sitemap.xml")
robots = (ROOT / "robots.txt").read_text()
check("robots.txt points at the sitemap", f"Sitemap: {BASE}/sitemap.xml" in robots)
sitemap_raw = (ROOT / "sitemap.xml").read_text()
try:
    root = ET.fromstring(sitemap_raw)
    locs = [e.text for e in root.iter(
        "{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    check("sitemap.xml is well-formed XML", True)
    check("sitemap.xml lists every page", len(locs) == len(PAGE_NAMES),
          f"{len(locs)} urls")
    check("sitemap.xml urls are absolute",
          all(str(u).startswith(BASE) for u in locs))
except ET.ParseError as e:
    check("sitemap.xml is well-formed XML", False, str(e))

print("\nvercel.json")
cfg = json.loads((ROOT / "vercel.json").read_text())
rewrites = cfg.get("rewrites", [])
check("vercel.json has a rewrite", len(rewrites) == 1)
if rewrites:
    r = rewrites[0]
    has = (r.get("has") or [{}])[0]
    check("rewrite is conditional on the Accept header",
          has.get("type") == "header" and has.get("key") == "accept")
    check("rewrite matches text/markdown only",
          "text/markdown" in str(has.get("value", "")))
    check("rewrite targets the function", "/api/md" in r.get("destination", ""))
    check("rewrite excludes /api itself", "?!api/" in r.get("source", ""))
check("vercel.json sets Vary: Accept",
      any(h.get("key") == "Vary" and h.get("value") == "Accept"
          for entry in cfg.get("headers", []) for h in entry.get("headers", [])))

print("\napi/md.js, executed")
fn = ROOT / "api" / "md.js"
check("api/md.js exists", fn.exists())
if fn.exists():
    harness = r"""
const handler = require(process.argv[2]);
function call(url, query) {
  const res = { statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b || ''; } };
  handler({ url, query: query || {} }, res);
  return { status: res.statusCode, type: res.headers['content-type'] || '',
           vary: res.headers['vary'] || '', len: res.body.length, body: res.body };
}
const out = {
  home: call('/api/md?p=/', { p: '/' }),
  cyprus: call('/api/md?p=/cyprus', { p: '/cyprus' }),
  cyprusHtml: call('/api/md?p=/cyprus.html', { p: '/cyprus.html' }),
  missing: call('/api/md?p=/__nope', { p: '/__nope' }),
};
console.log(JSON.stringify(out));
"""
    harness_path = ROOT / ".check_md_harness.js"
    harness_path.write_text(harness)
    try:
        proc = subprocess.run(
            ["node", str(harness_path), str(fn)],
            capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            check("api/md.js loads under node", False, proc.stderr.strip()[:200])
        else:
            check("api/md.js loads under node", True)
            r = json.loads(proc.stdout)
            for key, label in (("home", "/"), ("cyprus", "/cyprus"),
                               ("cyprusHtml", "/cyprus.html")):
                got = r[key]
                check(f"{label} returns 200", got["status"] == 200,
                      str(got["status"]))
                check(f"{label} is served as text/markdown",
                      got["type"].startswith("text/markdown"), got["type"])
                check(f"{label} sets Vary: Accept", got["vary"] == "Accept",
                      got["vary"])
                check(f"{label} has a non-empty body", got["len"] > 400,
                      f"{got['len']} chars")
            miss = r["missing"]
            check("unknown path returns 404", miss["status"] == 404,
                  str(miss["status"]))
            check("404 is served as text/markdown",
                  miss["type"].startswith("text/markdown"), miss["type"])
            check("404 sets Vary: Accept", miss["vary"] == "Accept", miss["vary"])
            check("404 body explains the error in 20+ characters",
                  miss["len"] >= 20, f"{miss['len']} chars")
            check("404 body links to llms.txt or the sitemap",
                  "llms.txt" in miss["body"] or "sitemap.xml" in miss["body"])
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError) as e:
        check("api/md.js executes", False, str(e))
    finally:
        harness_path.unlink(missing_ok=True)

print()
if failures:
    print(f"{len(failures)} check(s) failed:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("all agent-readiness checks passed")
