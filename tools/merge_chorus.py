#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# One-off: chorus.json = hand-cleaned songs 1-250 (kept) + source songs 251-329.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_children import parse_songs, entry, clean, DATA, CHORUS_SRC

CUR = os.path.join(DATA, 'chorus.json')


def main():
    cur = json.load(open(CUR, encoding='utf-8'))
    kept = [s for s in cur if s['number'] <= 250]
    for s in kept:                                   # scrub any stray glyphs/controls left
        s['title_ne'] = clean(s['title_ne'])
        for v in s['verses']:
            v['ne'] = clean(v['ne'])

    src = [s for f in CHORUS_SRC for s in parse_songs(os.path.join(DATA, f))]
    tail = [entry(s, 'chorus', 'Chorus', 'कोरस', short_title=True)
            for s in src if 251 <= s['number'] <= 329]

    out = kept + tail
    json.dump(out, open(CUR, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'chorus.json: kept 1-250 ({len(kept)}) + source 251-329 ({len(tail)}) = {len(out)}')


if __name__ == '__main__':
    main()
