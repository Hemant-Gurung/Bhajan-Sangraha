# -*- coding: utf-8 -*-
"""
Preeti -> Unicode Devanagari converter.

Rebuilt on the canonical Preeti keyboard map (source: github nepali-bhasa/
ttf-to-unicode preeti.yaml) so the capital-letter conjunct half-forms are
correct (S=क्, D=म्, Q=त्त, A=ब्, V=ख् ...). A small TUNED layer adds:
  - independent vowels typed as digraphs (cf=आ, cf]=ओ, O{=ई ...)
  - split conjuncts where 'm' is a closing half-form (qm=क्र, em=झ, pm=ऊ)
  - data deviations verified against the hymnal (0=ण full, i=ष full, 0ff=णा)
Then two reordering passes: short-i matra (typed before its consonant) and
reph (र् typed after its base).
"""
import re

# ---- canonical single-character base -------------------------------------
BASE = {
    # shifted number row -> Devanagari numerals & signs
    '!':'१','@':'२','#':'३','$':'४','%':'५','^':'६','&':'७','*':'८','(':'९',')':'०','_':')','+':'ं',
    # number row
    '`':'ञ','1':'ज्ञ','2':'द्द','3':'घ','4':'द्ध','5':'छ','6':'ट','7':'ठ','8':'ड','9':'ढ',
    '0':'ण्','-':'(','=':'.',
    # top row, caps (mostly half-forms for conjuncts)
    'Q':'त्त','W':'ध्','E':'भ्','R':'च्','T':'त्','Y':'थ्','U':'ग्','I':'क्ष्','O':'इ','P':'ए','}':'ै','|':'्र',
    # top row, lower
    'q':'त्र','w':'ध','e':'भ','r':'च','t':'त','y':'थ','u':'ग','i':'ष्','o':'य','p':'उ','[':'ृ',']':'े','\\':'्',
    # home row, caps
    'A':'ब्','S':'क्','D':'म्','F':'ँ','G':'न्','H':'ज्','J':'व्','K':'प्','L':'ी',':':'स्','"':'ू',
    # home row, lower
    'a':'ब','s':'क','d':'म','f':'ा','g':'न','h':'ज','j':'व','k':'प','l':'ि',';':'स',"'":'ु',
    # bottom row, caps
    'Z':'श्','X':'ह्','C':'ऋ','V':'ख्','B':'द्य','N':'ल्','M':'ः','<':'?','>':'श्र','?':'रु',
    # bottom row, lower
    'z':'श','x':'ह','c':'अ','v':'ख','b':'द','n':'ल','m':'व',',':',','.':'।','/':'र',
    # reph marker: '{' is typed AFTER a consonant; reordered to र् below
    '{':'',
    '~':'ञ्','—':'-',
}

# ---- canonical extended conjuncts (Windows-1252 high bytes) ----------------
EXT = {
    '„':'ध्र','ˆ':'फ्','‰':'झ्','‹':'ङ्घ','•':'ड्ड','›':'द्र','¡':'ज्ञ्','¢':'द्घ','£':'घ्','¤':'झ्',
    '¥':'र्‍','§':'ट्ट','©':'र','ª':'ङ','«':'्र','°':'ङ्ढ','¶':'ठ्ठ','¿':'रू','Å':'हृ',
    'Ë':'ङ्ग','Ì':'न्न','Í':'ङ्क','Î':'ङ्ख','Ý':'ट्ठ','ß':'द्म','å':'द्व','ç':'ॐ','Ø':'्य',
}

# ---- tuned layer: digraphs, split conjuncts, verified data deviations ------
TUNED = {
    # independent vowels written as digraphs
    'cf]':'ओ','cf}':'औ','cf':'आ','O{':'ई','P]':'ऐ',
    # ो / ौ matras
    'f]':'ो','f}':'ौ',
    # full forms this hymnal uses (canonical gives half-forms; data wants full)
    '0':'ण','i':'ष','0f':'णा','0ff':'णा','08':'ण्ड','i6':'ष्ट','If':'क्ष','km':'फ','b"':'दू',
    # split conjuncts: 'm' closes a ligature (standalone m = व)
    'qm':'क्र','q"m':'क्रू',"q'm":'क्रु','Qm':'क्त',     # क्र / क्त
    'em':'झ','e}m':'झै','e"m':'झू',"e'm":'झु','e]m':'झे',  # झ
    'pm':'ऊ',                                               # independent ऊ
    'Ø':'य',   # this hymnal types छ्यान as \Ø (halant already present) -> य, not ्य
}

WORK = dict(BASE)
WORK.update(EXT)
WORK.update(TUNED)

# longest Preeti sequences matched first
MULTI = sorted((k for k in WORK if len(k) > 1), key=len, reverse=True)


def convert(text):
    # protect "(N)" repeat markers so ( 3 ) don't become numerals ९ घ ०
    prot = []
    def _save(m):
        prot.append(m.group(0)); return chr(0xE000 + len(prot) - 1)
    text = re.sub(r'\([0-9!@#$%^&*]\)', _save, text)
    # un-split the m-closing conjuncts: 'm' closes फ(k)/क्र(q)/झ(e)/त्त(Q) and matras
    # are typed BETWEEN opener and m (e.g. फै = k}m). Move those matras after the m
    # so the adjacent rules (km=फ, qm=क्र, em=झ, Qm=क्त) fire and matras follow.
    text = re.sub(r"([kqeQ])([fL'\"\[\]}\\+MF]*)m", r"\1m\2", text)

    out, i, n = [], 0, len(text)
    while i < n:
        for seq in MULTI:
            if text.startswith(seq, i):
                out.append(WORK[seq]); i += len(seq); break
        else:
            out.append(WORK.get(text[i], text[i])); i += 1
    s = ''.join(out)
    # short-i matra is typed BEFORE its consonant cluster -> move it after
    s = re.sub(r'ि((?:[क-ह]्)*[क-ह])', r'\1ि', s)
    # anusvara/chandrabindu typed BEFORE a vowel sign (e.g. सं+ा) -> it always
    # comes last in the syllable, so move it after the matra: संा -> सां
    s = re.sub(r'([ंँ])([ािीुूृेैोौ])', r'\2\1', s)
    # reph: marker sits after its base consonant (+ any matra) -> र् before cluster
    s = re.sub(r'((?:[क-ह]्)*[क-ह])([ा-ौंःँॅॉ]*)', r'र्\1\2', s)
    s = s.replace('', 'र्')
    for i, orig in enumerate(prot):           # restore protected "(N)" markers
        s = s.replace(chr(0xE000 + i), orig)
    return s


if __name__ == '__main__':
    CASES = {
        'k/d]Zj/':'परमेश्वर','o]z"':'येशू','dlxdf':'महिमा','hLjg':'जीवन','k|e\'':'प्रभु',
        'cfgGb':'आनन्द','d\'lQmbftf':'मुक्तिदाता','3/':'घर','uf]7fnfx¿':'गोठालाहरू',
        'sf]qmf]':'कोक्रो','q"m;':'क्रूस','k\'q':'पुत्र','ldq':'मित्र','hfpm':'जाऊ',
        ';fFem':'साँझ','eg]e}mF':'भनेझैँ','/fVb5':'राख्दछ','s?0ff':'करुणा',
        'k\'g?Tyfg':'पुनरुत्थान','O{Zj/':'ईश्वर','Sn]z':'क्लेश','Ifdf':'क्षमा',
        'cfk\\mgf]':'आफ्नो','k}mnfof}':'फैलायौ','cfk}+m':'आफैं',
        'kljq, (3) k/d]Zj/':'पवित्र, (3) परमेश्वर',
    }
    bad = 0
    for src, exp in CASES.items():
        got = convert(src)
        ok = got == exp
        bad += not ok
        print(('ok  ' if ok else 'FAIL'), src, '->', got, '' if ok else f'(want {exp})')
    print('--- ALL PASS ---' if not bad else f'--- {bad} FAILED ---')
