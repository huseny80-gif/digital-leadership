"""Package educational source data and documents, excluding the Finquiz UI."""
import argparse
import hashlib
import html
import json
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path

ALLOWED = set('h1 h2 h3 h4 h5 h6 p b strong em i ul ol li table thead tbody tr td th dl dt dd blockquote details summary code pre br hr sup sub span div'.split())

class ContentParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.body = False
        self.skip = 0
        self.output = []
        self.anchors = []

    def handle_starttag(self, tag, attrs):
        if tag == 'body': self.body = True
        if not self.body: return
        if tag in ('script', 'style', 'nav', 'footer'): self.skip += 1
        if self.skip: return
        if tag in ALLOWED: self.output.append('<' + tag + '>')
        if tag == 'a':
            href = dict(attrs).get('href', '')
            if href.startswith(('https://', 'http://')):
                self.output.append('<a href="' + html.escape(href, quote=True) + '" target="_blank" rel="noopener noreferrer">')
                self.anchors.append('a')
            else:
                self.output.append('<span>')
                self.anchors.append('span')
        if tag == 'img' and dict(attrs).get('alt'): self.output.append(html.escape(dict(attrs)['alt']))

    def handle_endtag(self, tag):
        if not self.body: return
        if tag in ('script', 'style', 'nav', 'footer'):
            self.skip -= 1
            return
        if self.skip: return
        if tag in ALLOWED and tag not in ('br', 'hr'): self.output.append('</' + tag + '>')
        if tag == 'a' and self.anchors: self.output.append('</' + self.anchors.pop() + '>')
        if tag == 'body': self.body = False

    def handle_data(self, data):
        if self.body and not self.skip: self.output.append(html.escape(data))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    destination = Path(__file__).resolve().parents[1] / 'content' / 'finquiz'
    destination.mkdir(parents=True, exist_ok=True)
    node = "const fs=require('fs'),p=require('path');console.log(JSON.stringify(fs.readdirSync(p.join(process.argv[1],'data/subjects')).filter(f=>f.endsWith('.js')&&f!=='index.js').map(f=>require(p.join(process.argv[1],'data/subjects',f)))));"
    subjects = json.loads(subprocess.check_output(['node', '-e', node, str(source)]))
    assets = {}
    for file in sorted((source / 'files').rglob('*')):
        if not file.is_file() or file.suffix.lower() not in ('.pdf', '.pptx', '.xlsx', '.docx', '.html'): continue
        relative = file.relative_to(source).as_posix()
        asset_id = hashlib.sha256(relative.encode()).hexdigest()[:24]
        row = {'id': asset_id, 'path': relative, 'subjectSlug': file.relative_to(source / 'files').parts[0], 'filename': file.name, 'sizeBytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
        if file.suffix.lower() == '.html':
            content = ContentParser()
            content.feed(file.read_text())
            row['bodyHtml'] = ''.join(content.output)
        else:
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
        assets[asset_id] = row
    for subject in subjects:
        subject.pop('accent', None)
        subject.pop('icon', None)
    counts = {key: sum(len(s.get(key, [])) for s in subjects) for key in ('lectures', 'summaries', 'assignments', 'quizzes', 'references', 'resources', 'updates')}
    counts['questions'] = sum(len(q['questions']) for s in subjects for q in s['quizzes'])
    manifest = {'sourceRepository': 'huseny80-gif/Finquiz', 'sourceCommit': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD']).decode().strip(), 'counts': counts, 'subjects': subjects, 'assets': assets}
    (destination / 'catalog.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'counts': counts, 'assets': len(assets), 'binaryFiles': sum('bodyHtml' not in a for a in assets.values())}))

if __name__ == '__main__': main()
