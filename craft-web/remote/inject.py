"""Inline craft-remote.js into a built site: python3 inject.py <app> <site dir>."""
import pathlib
import sys

app, site = sys.argv[1], pathlib.Path(sys.argv[2])
script = (pathlib.Path(__file__).parent / "craft-remote.js").read_text(encoding="utf-8")
index = site / "index.html"
html = index.read_text(encoding="utf-8")
if html.count("</head>") != 1:
    sys.exit(f"inject.py: no single </head> in {index}")
index.write_text(html.replace("</head>", f'<script data-app="{app}">\n{script}</script>\n</head>'), encoding="utf-8")
for stale in ("index.html.gz", "index.html.br"):
    (site / stale).unlink(missing_ok=True)
