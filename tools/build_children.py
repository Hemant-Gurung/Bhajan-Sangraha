#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Parse Balsongs_unicode_1-70.txt -> children songs, splice into songs.json
# (replaces the existing 'children' entries).
import json, os, re, sys

DATA = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')
SRC = os.path.join(DATA, 'Balsongs_unicode_1-70.txt')
CHORUS_SRC = ['chorus-unicode-1-250.txt', 'chorus-unicode-251-329.txt']

CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')   # C0 controls (keep \t\n\r); strays from conversion
STRAY = re.compile(r'[ÞÚæÆÙ]')                        # leftover Preeti glyphs (delete -> correct word)
TITLE_CUT = re.compile(r'[,।(]')                      # first clause = title


def clean(s):
    return STRAY.sub('', CTRL.sub('', s))


def first_phrase(line):
    line = VERSE_MARK.sub('', line.strip()).lstrip('(').strip()
    t = TITLE_CUT.split(line)[0].strip(' )(')
    return t[:50].rsplit(' ', 1)[0] if len(t) > 50 else t

DIG = '०१२३४५६७८९'
D2I = {c: str(i) for i, c in enumerate(DIG)}
HDR = re.compile(r'^([' + DIG + r']+)\s+(.*)$')          # number then rest
VERSE_MARK = re.compile(r'^[' + DIG + r']+\.\s*')         # leading "१. "
ENG_TITLE = re.compile(r'\(([^)]*[A-Za-z][^)]*)\)')       # parens containing ASCII letters


def deva_int(s):
    return int(''.join(D2I[c] for c in s))


# --- Devanagari -> Latin transliteration (for roman search/display) ---
_V = {'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ए': 'e',
      'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri'}
_M = {'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai',
      'ो': 'o', 'ौ': 'au', 'ृ': 'ri'}
_C = {'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng', 'च': 'ch', 'छ': 'chh',
      'ज': 'j', 'झ': 'jh', 'ञ': 'ny', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh',
      'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p',
      'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l',
      'व': 'w', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h'}
_NASAL = {'ं': 'n', 'ँ': 'n', 'ः': 'h'}
_VIRAMA = '्'


def romanize(text):
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c in _C:
            out.append(_C[c])
            nxt = text[i + 1] if i + 1 < n else ''
            if nxt == _VIRAMA:                  # cluster: no vowel
                i += 2
            elif nxt in _M:
                out.append(_M[nxt]); i += 2
            else:                               # inherent schwa
                out.append('a'); i += 1
        elif c in _V:
            out.append(_V[c]); i += 1
        elif c in _M:
            out.append(_M[c]); i += 1
        elif c in _NASAL:
            out.append(_NASAL[c]); i += 1
        elif c == _VIRAMA:
            i += 1
        elif c in D2I:
            out.append(D2I[c]); i += 1          # devanagari digit -> ascii
        else:
            out.append(c); i += 1               # spaces, latin, punctuation
    return ''.join(out).title()


def parse_header(rest):
    """Return (english_title_or_None, inline_verse_or_None)."""
    if rest.startswith('स्केल') or rest.startswith('ताल'):
        return None, None
    em = ENG_TITLE.search(rest)
    if em and 'स्केल' in rest:                            # "(English) स्केल ..."
        return em.group(1).strip(), None
    if 'स्केल' in rest or rest.startswith('स्केल'):       # devanagari/garbage title + scale -> drop
        return None, None
    # no scale marker at all -> the rest is actually the first verse line
    return None, rest.strip()


def parse_songs(path=SRC):
    lines = open(path, encoding='utf-8').read().split('\n')
    heads = []                                            # (line_idx, number, eng_title, inline_verse)
    for i, l in enumerate(lines):
        m = HDR.match(l.strip())
        if not m:
            continue
        rest = m.group(2)
        if rest.startswith('.'):                          # "१. ..." is a verse, not a header
            continue
        eng, inline = parse_header(rest)
        heads.append((i, deva_int(m.group(1)), eng, inline))

    songs = []
    for k, (idx, num, eng, inline) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        verse_lines = ([inline] if inline else []) + \
                      [l.strip() for l in lines[idx + 1:end] if l.strip()]
        verses = [{'ne': v, 'en': ''} for v in verse_lines]
        title_ne = VERSE_MARK.sub('', verse_lines[0]) if verse_lines else ''
        songs.append({'number': num, 'eng': eng, 'title_ne': title_ne, 'verses': verses})
    return songs


def entry(s, book, section, section_ne, short_title):
    # ponytail: id == number; selection is book-scoped so cross-book id
    # collisions are harmless (see operator.js selectSong).
    verses = [{'ne': clean(v['ne']), 'en': v['en']} for v in s['verses']]
    title_ne = first_phrase(verses[0]['ne']) if short_title and verses else clean(s['title_ne'])
    title = s['eng'] or romanize(title_ne)
    return {'id': s['number'], 'number': s['number'], 'book': book,
            'title': clean(title), 'title_ne': title_ne,
            'section': section, 'section_ne': section_ne, 'verses': verses}


def write(name, rows):
    json.dump(rows, open(os.path.join(DATA, name), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f'{name}: {len(rows)} songs')


def clean_file(name):
    rows = json.load(open(os.path.join(DATA, name), encoding='utf-8'))
    for s in rows:
        s['title_ne'] = clean(s['title_ne'])
        for v in s['verses']:
            v['ne'] = clean(v['ne'])
    write(name, rows)


def main():
    # balchorus: from the Balsongs txt. chorus is a curated merge (built once by
    # merge_chorus, kept by hand) so it is NOT regenerated here. bhajan only needs
    # stray-byte cleanup.
    children = [entry(s, 'children', 'Bal Geet', 'बाल गीत', short_title=False)
                for s in parse_songs()]
    write('balchorus.json', children)
    clean_file('bhajan.json')
    clean_file('chorus.json')


if __name__ == '__main__':
    if '--test' in sys.argv:
        assert romanize('येशू') == 'Yeshu', romanize('येशू')
        assert romanize('मलाई') == 'Malai', romanize('मलाई')
        assert romanize('गर्छन्') == 'Garchhan', romanize('गर्छन्')
        print('ok')
    else:
        main()
