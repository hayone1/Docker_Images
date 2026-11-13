"""Inline craft-files.js, craft-remote.js, craft-embed.js and craft-storage.js into a built site: python3 inject.py <app> <site dir>."""
import hashlib
import pathlib
import re
import sys

app, site = sys.argv[1], pathlib.Path(sys.argv[2])
here = pathlib.Path(__file__).parent
script = "".join((here / f).read_text(encoding="utf-8") for f in ("craft-files.js", "craft-remote.js", "craft-embed.js", "craft-storage.js"))
index = site / "index.html"
html = index.read_text(encoding="utf-8")
if html.count("</head>") != 1:
    sys.exit(f"inject.py: no single </head> in {index}")
index.write_text(html.replace("</head>", f'<script data-app="{app}">\n{script}</script>\n</head>'), encoding="utf-8")
for stale in ("index.html.gz", "index.html.br"):
    (site / stale).unlink(missing_ok=True)
# effectcraft's service worker answers every same-origin GET (navigations with the app page); let
# the assistant, storage, editor and craft-web-gateway paths (at the root or under /<app>/) through.
# It serves its precached files (index.html too) until its VERSION changes, so the version also
# names these scripts: a new build of them replaces the cached page.
sw = site / "sw.js"
if sw.exists():
    guard = "  if (req.method !== \"GET\" || url.origin !== self.location.origin) return;\n"
    text = sw.read_text(encoding="utf-8")
    if text.count(guard) != 1:
        sys.exit(f"inject.py: {sw} no longer matches")
    skip = r"  if (/\/_(storage|assistant|embed|hub)\//.test(url.pathname)) return;" + "\n"
    text = text.replace(guard, guard + skip)
    tag = hashlib.sha256(script.encode("utf-8")).hexdigest()[:8]
    text, n = re.subn(r'^const VERSION = "([^"\\]*)";$', lambda m: f'const VERSION = "{m.group(1)}-{tag}";', text, count=1, flags=re.M)
    if n != 1:
        sys.exit(f"inject.py: {sw} has no VERSION line")
    sw.write_text(text, encoding="utf-8")
