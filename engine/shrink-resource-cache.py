#!/usr/bin/env python3
"""Shrinks the thumbnails in a prebuilt Krita resource database (engine/make-resource-cache.mjs calls this).

Krita stores a pattern's whole image as its thumbnail, so the database that ships with the web
build was mostly thumbnails. Choosers show them small; anything larger than MAX pixels is scaled
down and every thumbnail is re-encoded as an optimised PNG. Usage: shrink-resource-cache.py <db>
"""
import io, sqlite3, sys
from PIL import Image

MAX = 128   # ponytail: previews larger than this in a chooser look soft; raise it if a panel shows them bigger
db = sqlite3.connect(sys.argv[1])
before = after = 0
for rid, blob in db.execute("select id, thumbnail from resources where thumbnail is not null").fetchall():
    before += len(blob)
    try:
        image = Image.open(io.BytesIO(blob))
        image.load()
    except Exception:
        after += len(blob)      # not an image we understand: leave it alone
        continue
    if max(image.size) > MAX:
        image.thumbnail((MAX, MAX), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, "PNG", optimize=True)
    smaller = out.getvalue() if len(out.getvalue()) < len(blob) else blob
    after += len(smaller)
    if smaller is not blob:
        db.execute("update resources set thumbnail = ? where id = ?", (smaller, rid))
db.commit()
db.execute("vacuum")
db.close()
print(f"thumbnails: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB")
