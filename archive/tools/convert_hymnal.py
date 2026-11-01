#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
convert_hymnal.py — build the app's songs.json straight from the Preeti PDF.

Pipeline:  PDF  ->  inflate text streams  ->  pull Preeti literals
           ->  cp1252 decode  ->  preeti_to_unicode.convert()  ->  songs.json

Run it yourself, no extra tools needed (pure Python 3 stdlib + preeti_to_unicode.py).

USAGE
  python3 convert_hymnal.py                      # convert everything, update songs.json
  python3 convert_hymnal.py --range 20-52        # convert ONLY songs 20..52 into songs.json
  python3 convert_hymnal.py --range 20-52 --preview   # show that range, write nothing
  python3 convert_hymnal.py --preview            # show everything, write nothing
  python3 convert_hymnal.py --song 27            # preview one song (prints, no write)
  python3 convert_hymnal.py --pdf "X.pdf" --songs "/path/songs.json"

It MATCHES verses to the existing songs.json by song number (keeps your titles).
Songs whose body it can't find are left title-only and reported at the end.
Re-run any time; it overwrites verses for songs it successfully parses.
"""
import argparse, json, os, re, sys, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from preeti_to_unicode import convert  # your converter, single source of truth

# Preeti shifted-number row -> digit, for reading song / verse numbers
NUM = {')':'0','!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9'}
VERSE_MARK = re.compile(r'[)!@#$%^&*(]=')          # verse markers: != @= #= ...
CHORUS = 'sf]M'                                     # "कोरसः" chorus label in Preeti
SCALE_HDR = re.compile(r':s\]n.*?tfn\s*\S+', re.S)  # "Scale X, taal Y" header


def extract_preeti(pdf_path):
    """Inflate every FlateDecode stream and concatenate the ( ) text literals."""
    buf = open(pdf_path, 'rb').read()
    out, i = [], 0
    while True:
        s = buf.find(b'stream', i)
        if s < 0:
            break
        st = s + 6
        if buf[st:st+1] == b'\r': st += 1
        if buf[st:st+1] == b'\n': st += 1
        e = buf.find(b'endstream', st)
        if e < 0:
            break
        try:
            txt = zlib.decompress(buf[st:e]).decode('latin1')
            # join the ( ... ) string literals (PDF Tj/TJ operands)
            for m in re.findall(r'\((?:\\.|[^\\()])*\)', txt):
                out.append(m[1:-1])
        except Exception:
            pass
        i = e + 9
    s = ''.join(out)
    s = s.replace('\\(', '(').replace('\\)', ')').replace('\\\\', '\\')
    s = re.sub(r'\\([0-7]{1,3})', lambda m: chr(int(m.group(1), 8)), s)   # PDF octal escapes
    return s.encode('latin1', 'ignore').decode('cp1252', 'ignore')        # Preeti high bytes = cp1252


def read_song_number(preeti, hs):
    """The Preeti numerals just before a ':s]n' header are the song number.
    Returns (number, start_index_of_numerals) or (None, hs)."""
    ps = max(0, hs - 12)
    m = re.search(r'([)!@#$%^&*(]+)\s*$', preeti[ps:hs])
    if not m:
        return None, hs
    digits = ''.join(NUM.get(c, '') for c in m.group(1))
    return (int(digits) if digits else None), ps + m.start()


def parse_songs(preeti):
    """Return {song_number: [verse_preeti, ...]} for every body that has a Scale header."""
    # collect (number, numeral_start, header_end) for each song
    hs_list = [m.start() for m in re.finditer(r':s\]n', preeti)]
    bodies = []
    for idx, hs in enumerate(hs_list):
        body_end = hs_list[idx+1] - 12 if idx+1 < len(hs_list) else len(preeti)
        body = preeti[hs:body_end]
        body = SCALE_HDR.sub('', body, count=1)          # drop "Scale X, taal Y"
        body = body.replace(CHORUS, ' \x01 ')            # mark chorus boundaries
        pieces = re.split(r'[)!@#$%^&*(]=|\x01', body)    # split on verse + chorus marks
        verses = []
        for p in pieces:
            t = convert(p).strip(' .।\x01')
            t = re.sub(r'\s{2,}', ' ', t).strip(' .।')      # tidy whitespace
            if len(re.findall(r'[ऀ-ॿ]', t)) >= 4:   # keep real Devanagari lines
                verses.append(t)
        if verses:
            verses[-1] = re.sub(r'\s*[।.]?\s*[०-९]{1,3}(\s+\S.*)?$', '', verses[-1], flags=re.S).strip(' .।')
            bodies.append(verses)
    return bodies


_MATRAS = set('ािीुूृॄेैोौंःँॅॉ़्ॊॆ')

def skel(s):
    """Skeleton: Devanagari base letters only (drop matras/signs). This makes the
    match matra-insensitive, so lossy title रु matches clean verse रू, etc."""
    return ''.join(c for c in s if 'ऀ' <= c <= 'ॿ' and c not in _MATRAS)


def match_bodies(bodies, bhajan_path):
    """Map each parsed body to a song NUMBER by matching its first line (skeleton)
    to the song titles (the title is the hymn's first line). Far more reliable than
    the PDF's printed numbers, which sit behind English captions. Bodies that match
    no bhajan title (e.g. choruses) are simply dropped."""
    src = json.load(open(bhajan_path, encoding='utf-8'))
    titles = []                                   # (skeleton_title, number)
    for sec in src:
        for s in sec['songs']:
            st = skel(convert(s['title_nepali']))
            if len(st) >= 4:
                titles.append((st, s['number']))
    titles.sort(key=lambda t: -len(t[0]))         # longest title first -> most specific

    def bhajan_no(verses):
        first = skel(verses[0])
        for st, num in titles:
            if first.startswith(st):
                return num
        return None

    # The PDF prints all bhajans first, then choruses, then bal geet. Find where the
    # dense bhajan block ends: the first spot with a long run (40) of non-matches.
    matched = [bhajan_no(v) is not None for v in bodies]
    chorus_start = len(bodies)
    for i in range(len(bodies) - 40):
        if i >= 200 and not any(matched[i:i + 40]):
            chorus_start = i
            break

    bhajans, choruses = {}, []
    for i, verses in enumerate(bodies):
        n = bhajan_no(verses)
        if i < chorus_start:                      # bhajan block: assign by title
            if n is not None:
                bhajans.setdefault(n, verses)
        elif n is None:                           # chorus block: sequential (skip bal-geet dups)
            choruses.append(verses)
    return bhajans, choruses


def build_base(bhajan_path):
    """Build song entries (id, number, titles, sections) from the bhajan.json index,
    with Nepali run through the converter. Verses are filled in later."""
    src = json.load(open(bhajan_path, encoding='utf-8'))
    out, sid = [], 0
    for sec in src:
        sec_ne = convert(sec['section_nepali'])
        for s in sec['songs']:
            out.append({'id': sid, 'number': s['number'], 'book': 'bhajan',
                        'title': s['title_roman'], 'title_ne': convert(s['title_nepali']),
                        'section': sec['section_roman'], 'section_ne': sec_ne, 'verses': []})
            sid += 1
    return out


# Bal Geet (children's songs) are duplicates of bhajans. (bal_geet_no -> bhajan_no)
CHILDREN = [(1,442),(2,443),(3,444),(4,445),(5,446),(6,447),(7,448),(8,450),(9,451),(10,452),
            (11,453),(12,454),(13,455),(14,456),(15,457),(16,458),(17,459),(18,459),(19,460),
            (20,461),(21,462),(22,463),(23,464),(24,507)]


def add_children(songs):
    """Append Bal Geet entries by copying their source bhajan (title + verses)."""
    by_num = {}
    for s in songs:
        by_num.setdefault(s['number'], s)
    start = max(s['id'] for s in songs) + 1
    for child_no, bhajan_no in CHILDREN:
        src = by_num.get(bhajan_no)
        if not src:
            continue
        songs.append({'id': start + child_no, 'number': child_no, 'book': 'children',
                      'title': src['title'], 'title_ne': src['title_ne'],
                      'section': 'Bal Geet', 'section_ne': 'बाल गीत',
                      'verses': [dict(v) for v in src['verses']]})
    return songs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', default=os.path.join(HERE, 'Nepali Christiya Bhajan.pdf'))
    ap.add_argument('--bhajan', default=os.path.join(HERE, 'bhajan.json'),
                    help='song index (numbers/titles/sections)')
    ap.add_argument('--songs', default=os.path.join(HERE, '..', 'src', 'data', 'songs.json'))
    ap.add_argument('--song', type=int, help='preview ONE song number (no file write)')
    ap.add_argument('--range', help='only these song numbers, e.g. 20-52 (writes just that range)')
    ap.add_argument('--preview', action='store_true', help='print results, do not write songs.json')
    args = ap.parse_args()

    targets = None  # None = all songs
    if args.range:
        try:
            lo, hi = (int(x) for x in args.range.split('-'))
        except ValueError:
            sys.exit('--range must look like  20-52')
        targets = set(range(min(lo, hi), max(lo, hi) + 1))

    if not os.path.exists(args.pdf):
        sys.exit(f'PDF not found: {args.pdf}')
    print('Extracting Preeti from PDF ...')
    preeti = extract_preeti(args.pdf)
    print('Parsing song bodies ...')
    bodies = parse_songs(preeti)
    bhajans, choruses = match_bodies(bodies, args.bhajan)   # bhajans by title; choruses sequential
    print(f'Parsed {len(bodies)} bodies: {len(bhajans)} bhajans matched, {len(choruses)} choruses.')

    if args.song is not None:
        targets = {args.song}

    def wanted(n):
        return targets is None or n in targets

    # preview mode (also used implicitly by --song): print, don't write
    if args.preview or args.song is not None:
        shown = [n for n in sorted(bhajans) if wanted(n)]
        if not shown:
            sys.exit('No parsable body for the requested song(s).')
        for n in shown:
            print(f'\n#{n}')
            for i, v in enumerate(bhajans[n], 1):
                print(f'  [{i}] {v}')
        return

    # rebuild titles/sections from the index (so converter fixes always apply),
    # keep verses already saved for songs OUTSIDE the chosen range.
    prev = {}
    if os.path.exists(args.songs):
        for s in json.load(open(args.songs, encoding='utf-8')):
            if s.get('verses'):
                prev.setdefault((s.get('book', 'bhajan'), s['number']), s['verses'])
    songs = build_base(args.bhajan)          # bhajans only (book='bhajan')
    filled = 0
    for s in songs:
        n = s['number']
        if wanted(n) and bhajans.get(n):
            s['verses'] = [{'ne': v, 'en': ''} for v in bhajans[n]]
            filled += 1
        elif targets is not None and ('bhajan', n) in prev:
            s['verses'] = prev[('bhajan', n)]   # preserve progress only for songs OUTSIDE a --range run
    add_children(songs)                       # Bal Geet entries copied from filled bhajans
    # chorus book: numbered sequentially in print order (no titles to match)
    cid = max(s['id'] for s in songs) + 1
    for i, verses in enumerate(choruses, 1):
        songs.append({'id': cid + i, 'number': i, 'book': 'chorus',
                      'title': f'Chorus {i}', 'title_ne': verses[0][:30],
                      'section': 'Chorus', 'section_ne': 'कोरस',
                      'verses': [{'ne': v, 'en': ''} for v in verses]})
    json.dump(songs, open(args.songs, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    scope = f'songs {min(targets)}-{max(targets)}' if targets else 'all songs'
    print(f'Wrote {args.songs}: {filled} bhajans + {len(choruses)} choruses filled ({scope}).')
    if targets is None:
        missing = sorted({s['number'] for s in songs if s['book'] == 'bhajan'} - set(bhajans))
        print(f'{len(missing)} bhajan numbers had no parsable body (left title-only).')


if __name__ == '__main__':
    main()
