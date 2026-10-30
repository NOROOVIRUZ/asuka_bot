"""asuka 서재 로컬 서버 — docs/ 대시보드 + 위키 기록(/wiki.json, /wiki-page).
위키는 비공개라 GitHub Pages에 안 올리고, 이 서버가 열릴 때마다 asuka-wiki에서 바로 읽는다.
127.0.0.1 전용. 실행: python3 tools/serve_library.py [포트]"""
import http.server, json, re, sys, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'docs'
WIKI = Path.home() / 'projects/asuka-wiki/30-wiki'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8985


def frontmatter(text):
    m = re.match(r'---\n(.*?)\n---', text, re.S)
    meta = {}
    for line in (m.group(1).splitlines() if m else []):
        k, sep, v = line.partition(':')
        if not sep or line.startswith(' '):
            continue
        v = v.strip()
        if v.startswith('[') and v.endswith(']'):
            v = [x.strip().strip('"\'') for x in v[1:-1].split(',') if x.strip()]
        else:
            v = v.strip('"\'')
        meta[k.strip()] = v
    return meta


def wiki_index():
    out = []
    for f in sorted(WIKI.rglob('*.md')):
        rel = f.relative_to(WIKI).as_posix()
        if '/indexes/' in rel or f.name in ('index.md', 'log.md', 'aliases.md'):
            continue  # 자동 목차·로그는 검색 잡음
        meta = frontmatter(f.read_text(encoding='utf-8', errors='ignore'))
        out.append({
            'path': rel,
            'canonical': meta.get('canonical') or meta.get('title') or f.stem,
            'aka': meta.get('aka') if isinstance(meta.get('aka'), list) else [],
            'summary': meta.get('summary', ''),
            'topic': meta.get('topic') or rel.split('/')[0],
            'category': meta.get('category', ''),
            'type': meta.get('type', ''),
            'tags': meta.get('tags') if isinstance(meta.get('tags'), list) else [],
        })
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def send_text(self, body, ctype):
        data = body.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', f'{ctype}; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/wiki.json':
            return self.send_text(json.dumps(wiki_index(), ensure_ascii=False), 'application/json')
        if u.path == '/wiki-page':
            rel = urllib.parse.parse_qs(u.query).get('p', [''])[0]
            f = (WIKI / rel).resolve()
            if not f.is_relative_to(WIKI.resolve()) or f.suffix != '.md' or not f.is_file():
                return self.send_error(404)  # 위키 폴더 밖 경로 차단
            return self.send_text(f.read_text(encoding='utf-8'), 'text/plain')
        return super().do_GET()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    assert frontmatter('---\ncanonical: "a"\naka: [b, "c"]\n---\n') == {'canonical': 'a', 'aka': ['b', 'c']}
    print(f'asuka 서재: http://127.0.0.1:{PORT}/  (위키 {len(wiki_index())}장)')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
