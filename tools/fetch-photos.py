#!/usr/bin/env python3
"""Download the species photos shown by the collector from Wikimedia Commons.

    python3 tools/fetch-photos.py [--width 400]

Writes web/photos/<variant_id>.jpg plus web/photos/credits.html, which carries
the author and licence each photo has to be shown with. The photo ids match the
variant ids in web/shared.js; re-run after adding a species there.
"""

import argparse
import html
import json
import pathlib
import sys
import urllib.parse
import urllib.request

UA = 'mushroom-foraging/0.1 (https://github.com/Forest734; photo fetch for local use)'
API = 'https://commons.wikimedia.org/w/api.php'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'web' / 'photos'

# variant id -> Commons file. Chosen from the taxon image Wikidata records for
# the species (P18), so each one is a curated picture of that species.
PHOTOS = {
    'cantharellus_flavus': 'File:Cantharellus flavus.jpg',
    'cantharellus_tenuithrix': 'File:Cantharellus tenuithrix M.J. Foltz & T.J. Volk 431109.jpg',
    'cantharellus_phasmatis': 'File:Cantharellus phasmatis 344135.jpg',
    'cantharellus_roseocanus': 'File:Cantharellus roseocanus (Redhead, Norvell & Danell) Redhead, Norvell & Moncalvo 260832.jpg',
    'cantharellus_enelensis': 'File:Cantharellus enelensis Voitk, Thorn, Lebeuf, J.I. Kim 153724.jpg',
    'cantharellus_lateritius': 'File:Cantharellus lateritius 54894.jpg',
    'cantharellus_cinnabarinus': 'File:Cantharellus cinnabarinus 93293.jpg',
    'cantharellus_minor': 'File:Cantharellus minor 544.jpg',
    'cantharellus_appalachiensis': 'File:Cantharellus appalachiensis 95778.jpg',
    'cantharellus_persicinus': 'File:Cantharellus persicinus 52575.jpg',
    'craterellus_fallax': 'File:Craterellus fallax .jpg',
    'craterellus_cornucopioides': 'File:Craterellus cornucopioides JPG1.jpg',
    'craterellus_foetidus': 'File:Craterellus foetidus 95072218.jpg',
    'craterellus_calicornucopioides': 'File:2020-03-08 Craterellus calicornucopioides D. Arora & J.L. Frank 1160155.jpg',
    'craterellus_tubaeformis': 'File:Cantharellus tubaeformis G28.JPG',
    'craterellus_ignicolor': 'File:Flame Chanterelle.jpg',
    'craterellus_lutescens': 'File:Cantharellus lutescens.jpg',
    'craterellus_odoratus': 'File:2016-06-08 Craterellus odoratus (Schwein.) Fr 628974.jpg',
    'hericium_erinaceus': 'File:Igelstachelbart Nov 06.jpg',
    'hericium_americanum': 'File:Hericium americanum 59312.jpg',
    'hericium_coralloides': 'File:2009-09-25 Hericium coralloides (Scop.) Pers 58068 crop.jpg',
}


def api(**params):
    params.setdefault('action', 'query')
    params.setdefault('format', 'json')
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers={'User-Agent': UA})
    return json.load(urllib.request.urlopen(req, timeout=60))


def plain(value):
    """Commons returns small HTML fragments for author and licence."""
    import re
    text = re.sub(r'<[^>]+>', ' ', value or '')
    return ' '.join(html.unescape(text).split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--width', type=int, default=400, help='thumbnail width in pixels')
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    titles = list(PHOTOS.values())
    info = {}
    for i in range(0, len(titles), 20):
        data = api(titles='|'.join(titles[i:i + 20]), prop='imageinfo',
                   iiprop='url|extmetadata', iiurlwidth=args.width)
        for page in data['query']['pages'].values():
            if 'imageinfo' in page:
                info[page['title']] = page['imageinfo'][0]

    credits, failed = [], []
    for variant, title in PHOTOS.items():
        item = info.get(title.replace('_', ' '))
        if not item:
            failed.append((variant, 'not found on Commons'))
            continue
        meta = item.get('extmetadata', {})
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(item['thumburl'], headers={'User-Agent': UA}), timeout=120) as resp:
                blob = resp.read()
        except Exception as err:  # noqa: BLE001 - report and carry on to the rest
            failed.append((variant, str(err)))
            continue
        (OUT / f'{variant}.jpg').write_bytes(blob)
        credits.append({
            'variant': variant,
            'page': item['descriptionurl'],
            'author': plain(meta.get('Artist', {}).get('value')) or 'Unknown',
            'licence': plain(meta.get('LicenseShortName', {}).get('value')) or 'see the file page',
        })
        print(f'{variant:32s} {len(blob) // 1024:4d} KB  {credits[-1]["licence"]}')

    rows = '\n'.join(
        f'    <tr><td><img src="{c["variant"]}.jpg" alt="" width="60" loading="lazy"></td>'
        f'<td>{html.escape(c["variant"])}</td><td>{html.escape(c["author"])}</td>'
        f'<td>{html.escape(c["licence"])}</td>'
        f'<td><a href="{html.escape(c["page"])}">file page</a></td></tr>'
        for c in credits)
    (OUT / 'credits.html').write_text(f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo credits</title>
  <link rel="stylesheet" href="../styles.css">
</head>
<body class="page">
  <header class="bar"><h1>Photo credits</h1><nav><a href="../collect.html">Back</a></nav></header>
  <main>
    <p>Species photos come from <a href="https://commons.wikimedia.org">Wikimedia Commons</a>
    and are used under the licence each one carries. Generated by
    <code>tools/fetch-photos.py</code> — edit that, not this file.</p>
    <table class="credits">
    <tr><th></th><th>Species</th><th>Author</th><th>Licence</th><th>Source</th></tr>
{rows}
    </table>
  </main>
</body>
</html>
""")
    print(f'\n{len(credits)} photos in {OUT}')
    for variant, why in failed:
        print(f'FAILED {variant}: {why}', file=sys.stderr)
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
