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
    assert (closed / 'admin.html').read_bytes() == (ROOT / 'storefront.html').read_bytes()
    settings['closure']['enabled'] = False
    opened = Path(tmp) / 'open'
    build(opened, settings)
    assert (opened / 'index.html').read_bytes() == (ROOT / 'storefront.html').read_bytes()
    assert not (opened / '404.html').exists()
    assert not (opened / 'admin.html').exists()
    for path in (ROOT / 'assets/data').glob('*.json'):
        assert (opened / 'assets/data' / path.name).read_bytes() == path.read_bytes()
print('closed routes, preserved admin, original storefront and unchanged data restoration passed')

# Exercise the exact operational command against an isolated source tree.
import shutil
import subprocess
import sys
with TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / 'scripts').mkdir()
    (root / 'assets/data').mkdir(parents=True)
    for name in ('closure.html', 'storefront.html', 'assets/data/settings.json', 'scripts/set_closure.py'):
        shutil.copy2(ROOT / name, root / name)
    original = json.loads((root / 'assets/data/settings.json').read_text())
    for mode in ('open', 'closed', 'open'):
        subprocess.run([sys.executable, str(root / 'scripts/set_closure.py'), mode], check=True)
        current = json.loads((root / 'assets/data/settings.json').read_text())
        expected = json.loads(json.dumps(original))
        expected['closure']['enabled'] = mode == 'closed'
        assert current == expected
        assert (root / 'index.html').read_bytes() == (ROOT / ('closure.html' if mode == 'closed' else 'storefront.html')).read_bytes()
        assert (root / '404.html').exists() == (mode == 'closed')
        assert (root / 'admin.html').exists() == (mode == 'closed')
print('manual operational restoration and re-closure command passed')
