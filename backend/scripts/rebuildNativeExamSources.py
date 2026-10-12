"""Rebuild native transcripts of the four tagged AI PDFs from original bytes.

python backend/scripts/rebuildNativeExamSources.py
Requires pypdf==6.10.0. Other validated cache entries remain unchanged. The
only reviewed glyph-order correction (AI lecture 2, page 1) restores the
heading spelling visible in the PDF, never an external factual statement.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess, json, hashlib, sys, tempfile
root = Path(__file__).resolve().parents[2]
catalog = json.loads((root / 'backend/content/finquiz/catalog.json').read_text())
cache_path = root / 'backend/content/finquiz/extractedSources.json'
cache = json.loads(cache_path.read_text())
before = hashlib.sha256(cache_path.read_bytes()).hexdigest()

def rebuild(source):
    asset = next((a for a in catalog['assets'].values() if a['sha256'] == source['sha256'] and (not a.get('bodyHtml'))))
    if asset['id'] not in {'557a6e404fcd4ce161213ded', 'aea44816c87b86f1a4c73888', 'c35bf2365ef831ebbfcd124e', '01e397e5879b6ce3898d59d3'}:
        return source
    parts = [root / 'backend/content/finquiz' / p for p in asset.get('parts', [asset['path']])]
    b = b''.join((p.read_bytes() for p in parts))
    assert hashlib.sha256(b).hexdigest() == source['sha256']
    src = work / (asset['id'] + '.pdf')
    src.write_bytes(b)
    text = subprocess.check_output([sys.executable, str(root / 'backend/scripts/extractPdfActualText.py'), str(src)], text=True, stderr=subprocess.DEVNULL).strip()
    if asset['id'] == 'aea44816c87b86f1a4c73888':
        text = text.replace('جولة داخل كلود: الواجهات وا إلعدادات', 'جولة داخل كلود: الواجهات والإعدادات')
    assert len(text) > 1000 and '�' not in text
    print(asset['filename'], len(source['text']), '->', len(text), flush=True)
    return {'sha256': source['sha256'], 'textSha256': hashlib.sha256(text.encode()).hexdigest(), 'text': text, 'method': 'pdf-native-actualtext-v1'}
with tempfile.TemporaryDirectory(prefix='exam-native-') as directory:
    work = Path(directory)
    with ThreadPoolExecutor(max_workers=3) as pool:
        cache['sources'] = list(pool.map(rebuild, cache['sources']))
cache['version'] = 'verified-pdf-transcripts-v2'
cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + '\n')
print('Native transcripts rebuilt; original PDFs unchanged; previous cache SHA', before)
