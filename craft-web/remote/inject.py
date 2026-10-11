"""Inline craft-remote.js and craft-storage.js into a built site: python3 inject.py <app> <site dir>."""
import pathlib
import sys

app, site = sys.argv[1], pathlib.Path(sys.argv[2])
here = pathlib.Path(__file__).parent
script = "".join((here / f).read_text(encoding="utf-8") for f in ("craft-remote.js", "craft-storage.js"))
index = site / "index.html"
html = index.read_text(encoding="utf-8")
if html.count("</head>") != 1:
    sys.exit(f"inject.py: no single </head> in {index}")
index.write_text(html.replace("</head>", f'<script data-app="{app}">\n{script}</script>\n</head>'), encoding="utf-8")
for stale in ("index.html.gz", "index.html.br"):
    (site / stale).unlink(missing_ok=True)
# effectcraft's service worker answers every same-origin GET (navigations with the app page).
sw = site / "sw.js"
if sw.exists():
    guard = "  if (req.method !== \"GET\" || url.origin !== self.location.origin) return;\n"
    text = sw.read_text(encoding="utf-8")
    if text.count(guard) != 1:
        sys.exit(f"inject.py: {sw} no longer matches")
    sw.write_text(text.replace(guard, guard + r'  if (/^\/_(storage|assistant)\//.test(url.pathname)) return;\n'), encoding="utf-8")
