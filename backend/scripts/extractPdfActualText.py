"""Extract original marked-content characters from tagged lecture PDFs.

Usage: python extractPdfActualText.py ORIGINAL.pdf [PAGE_COUNT]
Requires pypdf==6.10.0. No OCR, model, authored summary, or external source is
used. /ActualText takes precedence over broken ToUnicode mappings. Original
font widths and page transforms supply layout spaces and reading order.
Rotated decorative labels are omitted; the original PDF remains untouched.
This developer-only tool rebuilds byte-hash-bound transcripts for the six AI
lectures with recoverable marked characters. Runtime upload extraction remains in pdfText.ts and fails on low
confidence OCR rather than inventing missing words.
"""
from pypdf import PdfReader
from pypdf.generic import ContentStream
from pypdf._cmap import get_encoding
import sys, unicodedata, re
p = PdfReader(sys.argv[1])
linesout = []

def mul(a, b):
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]

def walk(obj, cm=[1, 0, 0, 1, 0, 0], depth=0):
    if depth > 10:
        raise ValueError('deep forms')
    stream = obj.get_contents() if hasattr(obj, 'get_contents') else obj
    resources = obj.get('/Resources', {})
    fonts = resources.get('/Font', {})
    maps = {k: get_encoding(v.get_object()) for k, v in fonts.items()}
    pts = []
    font = None
    size = 12
    tm = [1, 0, 0, 1, 0, 0]
    x = y = 0
    stack = []
    states = []
    last = None

    def decode(o):
        raw = o if isinstance(o, bytes) else o.get_original_bytes()
        enc, mp = maps[font]
        encoded = raw.decode(enc, errors='replace') if isinstance(enc, str) else ''.join((enc.get(c, chr(c)) for c in raw))
        return (raw, unicodedata.normalize('NFKC', ''.join((mp.get(c, c) for c in encoded))))
    for args, op in ContentStream(stream, p).operations:
        if op == b'TJ':
            raise ValueError('This file needs another reviewed extractor (TJ is not supported).')
        if op == b'q':
            states.append(cm[:])
        elif op == b'Q':
            cm = states.pop()
        elif op == b'cm':
            cm = mul([float(a) for a in args], cm)
        elif op == b'Do':
            child = resources.get('/XObject', {}).get(args[0])
            if child is not None and child.get_object().get('/Subtype') == '/Form':
                c = child.get_object()
                pts += walk(c, mul([float(a) for a in c.get('/Matrix', [1, 0, 0, 1, 0, 0])], cm), depth + 1)
        elif op == b'Tf':
            font = args[0]
            size = float(args[1])
        elif op == b'Tm':
            tm = [float(a) for a in args]
            x = y = 0
        elif op in [b'Td', b'TD']:
            x += float(args[0])
            y += float(args[1])
        elif op in [b'BMC', b'BDC']:
            stack.append(str(args[1]['/ActualText']).lstrip('\ufeff') if op == b'BDC' and isinstance(args[1], dict) and ('/ActualText' in args[1]) else None)
        elif op == b'EMC':
            act = stack.pop() if stack else None
            if act is not None and last and (not any((s is not None for s in stack))):
                pts.append((*last, act))
        elif op == b'Tj' and font in maps:
            last = None
            raw, text = decode(args[0])
            fo = fonts[font].get_object()
            if '/Widths' in fo:
                widths = [float(fo['/Widths'][c - int(fo['/FirstChar'])]) for c in raw]
                fm = float(fo.get('/FontMatrix', [0.001])[0])
            elif '/DescendantFonts' in fo:
                descendant = fo['/DescendantFonts'][0].get_object()
                widthmap = {}
                wr = descendant['/W'] if '/W' in descendant else []
                n = 0
                while n < len(wr):
                    first = int(wr[n])
                    n += 1
                    if isinstance(wr[n], list):
                        widthmap.update(((first + j, float(v)) for j, v in enumerate(wr[n])))
                        n += 1
                    else:
                        end = int(wr[n])
                        val = float(wr[n + 1])
                        n += 2
                        widthmap.update(((j, val) for j in range(first, end + 1)))
                codes = [int.from_bytes(raw[n:n + 2], 'big') for n in range(0, len(raw), 2)]
                widths = [widthmap.get(c, float(descendant.get('/DW', 1000))) for c in codes]
                fm = 0.001
            else:
                raise ValueError('Unsupported source font')
            w = sum(widths) * size * fm
            m = mul(tm, cm)
            xx = x * m[0] + y * m[2] + m[4]
            yy = x * m[1] + y * m[3] + m[5]
            if abs(m[1]) > abs(m[0]) * 0.025:
                continue
            last = (xx, yy, abs(w * m[0]), abs(size * m[3]))
            if not any((s is not None for s in stack)) and text.strip():
                pts.append((*last, text))
    return pts
for page in p.pages[:int(sys.argv[2]) if len(sys.argv) > 2 else len(p.pages)]:
    pts = walk(page)
    lines = []
    for x, y, w, h, txt in pts:
        if abs(h) < 1:
            continue
        line = next((l for l in lines if abs(l['y'] - y) < h * 0.6), None)
        if line is None:
            line = {'y': y, 'items': []}
            lines.append(line)
        line['items'].append((x, w, h, txt))
    deferred_labels = []
    for l in sorted(lines, key=lambda l: -l['y']):
        chunks = sorted(l['items'], key=lambda i: -i[0])
        parts = []
        latin = []

        def latinish(t):
            return t.replace('١', '1').replace('٢', '2').replace('٣', '3').replace('٤', '4').replace('٥', '5').replace('٦', '6').replace('٧', '7').replace('٨', '8').replace('٩', '9').replace('٠', '0').replace(' ', '').isdigit() or all((not '\u0600' <= c <= 'ۿ' and (not 'ﹰ' <= c <= '\ufeff') for c in t))

        def render(ch):
            text = ''
            prev = None
            for x, w, h, t in ch:
                gap = prev[0] - (x + w) if prev else 0
                if gap > h * 0.16:
                    text += ' '
                text += t
                prev = (x, w, h, t)
            return text
        for item in chunks:
            if latinish(item[3]):
                latin.append(item)
            else:
                if latin:
                    ch = list(reversed(latin))
                    t = ''
                    prev = None
                    for x, w, h, z in ch:
                        if prev and x - (prev[0] + prev[1]) > h * 0.16:
                            t += ' '
                        t += z
                        prev = (x, w, h, z)
                    parts.append((min((v[0] for v in latin)), max((v[0] + v[1] for v in latin)) - min((v[0] for v in latin)), latin[0][2], t))
                    latin = []
                parts.append(item)
        if latin:
            ch = list(reversed(latin))
            t = ''
            prev = None
            for x, w, h, z in ch:
                if prev and x - (prev[0] + prev[1]) > h * 0.16:
                    t += ' '
                t += z
                prev = (x, w, h, z)
            parts.append((min((v[0] for v in latin)), max((v[0] + v[1] for v in latin)) - min((v[0] for v in latin)), latin[0][2], t))
        # A large horizontal gutter separates a screenshot UI column from
        # its explanatory prose. Do not splice UI labels into source sentences.
        segments = []
        current = []
        previous = None
        for item in parts:
            if previous and previous[0] - (item[0] + item[1]) > item[2] * .9:
                segments.append(current)
                current = []
            current.append(item)
            previous = item
        if current:
            segments.append(current)
        rendered = [render(segment) for segment in segments]
        narrative = any(re.search(r'[\u0621-\u064A]{3}', segment) for segment in rendered)
        kept = []
        for segment in rendered:
            if len(rendered) > 1 and narrative and re.search(r'[a-zA-Z]{3}', segment) and not re.search(r'[\u0621-\u064A]', segment):
                deferred_labels.append(segment)
            else:
                kept.append(segment)
        if kept:
            linesout.append(' '.join(kept))
    if deferred_labels:
        linesout.append('')
        linesout.extend(deferred_labels)
    linesout.append('')
print(unicodedata.normalize('NFC', '\n'.join(linesout)).replace('\ufeff', ''))
