#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Convert Preeti text in bhajan.txt -> Unicode in bhajan_unicode.txt
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from preeti_to_unicode import convert

DATA = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')
SRC = os.path.join(DATA, 'bhajan.txt')
# Output file: first non-flag arg, else default. Bare name -> src/data/.
_out = next((a for a in sys.argv[1:] if not a.startswith('-')), 'bhajan_unicode.txt')
DST = _out if os.path.dirname(_out) else os.path.join(DATA, _out)

NUM = {')':'०','!':'१','@':'२','#':'३','$':'४','%':'५','^':'६','&':'७','*':'८','(':'९'}

# Header line:  <preeti-num> [(English Title)] :s]n <Scale>, tfn <taal>
# Title, scale letter, and taal are English/music notation -> keep literal.
HDR = re.compile(r'^(?P<num>[)!@#$%^&*(]+)\s*(?P<title>\([^)]*\)\s*)?:s\]n\s*(?P<scale>.*?),?\s*tfnc?\s*(?P<taal>.*?)\s*$')


def conv_header(m):
    num = ''.join(NUM.get(c, c) for c in m['num'])
    title = (m['title'] or '').strip()
    title = (title + ' ') if title else ''
    return f"{num} {title}स्केल {m['scale'].strip()}, ताल {m['taal'].strip()}"


BARE_NUM = re.compile(r'^[)!@#$%^&*(]+$')   # song-number line with no scale header


def conv_line(line):
    m = HDR.match(line)
    return conv_header(m) if m else convert(line)


def conv_text(text):
    lines = text.split('\n')
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if not HDR.match(line) and BARE_NUM.match(line.strip()):
            # no scale header -> use the next non-empty line as the header
            num = ''.join(NUM.get(c, c) for c in line.strip())
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                out.append(f"{num} {convert(lines[j])}")
                i = j + 1
                continue
            out.append(num)
        else:
            out.append(conv_line(line))
        i += 1
    return '\n'.join(out)


# ponytail: header detection keys on ":s]n"; English titles/scale/taal pass through.
# Guard under __main__ so importing this module never writes files as a side effect.
if __name__ == '__main__':
    if '--test' in sys.argv:
        assert conv_line('# (O Worship the King) :s]n G, tfn 3/4') == '३ (O Worship the King) स्केल G, ताल 3/4'
        assert conv_line('! :s]n A, tfn c') == '१ स्केल A, ताल c'
        assert conv_line('!) (All Creatures of Our God and King):s]n C (D), tfn 3/4') == '१० (All Creatures of Our God and King) स्केल C (D), ताल 3/4'
        print('ok')
    else:
        if os.path.exists(DST) and '--force' not in sys.argv:
            sys.exit(f'refusing to overwrite existing {DST} (pass --force to override)')
        text = open(SRC, encoding='utf-8').read()
        open(DST, 'w', encoding='utf-8').write(conv_text(text))
        print(f'{SRC} -> {DST} ({len(text)} chars)')
