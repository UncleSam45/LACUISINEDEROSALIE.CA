import json
from pathlib import Path
from tempfile import TemporaryDirectory
from build_site import ROOT, build

settings = json.loads((ROOT / 'assets/data/settings.json').read_text())
with TemporaryDirectory() as tmp:
    closed = Path(tmp) / 'closed'
    build(closed, settings)
    assert (closed / 'index.html').read_bytes() == (closed / '404.html').read_bytes()
    assert b'main.js' not in (closed / 'index.html').read_bytes()
    assert (closed / 'admin.html').read_bytes() == (ROOT / 'index.html').read_bytes()
    settings['closure']['enabled'] = False
    opened = Path(tmp) / 'open'
    build(opened, settings)
    assert (opened / 'index.html').read_bytes() == (ROOT / 'index.html').read_bytes()
    assert not (opened / '404.html').exists()
    assert not (opened / 'admin.html').exists()
    for path in (ROOT / 'assets/data').glob('*.json'):
        assert (opened / 'assets/data' / path.name).read_bytes() == path.read_bytes()
print('closed routes, preserved admin, original storefront and unchanged data restoration passed')
