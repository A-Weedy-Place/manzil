"""Derive the curated profile picker from public GeoNames PK.zip; no network or GPS data.

Usage: python scripts/import-pakistan-cities.py .local-tools/pakistan-geonames.zip
GeoNames data is CC BY 4.0. See docs/PAKISTAN_CITIES.md for attribution and scope.
"""
import hashlib
import json
import pathlib
import re
import sys
import unicodedata
import zipfile

archive = pathlib.Path(sys.argv[1])
output = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'catalogues' / 'pakistan-cities.json'
selection = json.loads(pathlib.Path(__file__).with_name('pakistan-major-cities.json').read_text(encoding='utf-8'))
current_codes = {'PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLG', 'PPLL', 'PPLF'}


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c)).casefold()


cities = {}
with zipfile.ZipFile(archive) as source:
    for line in source.read('PK.txt').decode('utf-8').splitlines():
        row = line.split('\t')
        if len(row) != 19 or row[8] != 'PK' or row[6] != 'P' or row[7] not in current_codes:
            continue
        name = (row[2] or row[1]).strip()
        if not name or len(name) > 80:
            continue
        aliases = []
        candidates = [row[1], *row[3].split(',')]
        for candidate in candidates:
            candidate = candidate.strip()
            if not candidate or len(candidate) > 80 or normalized(candidate) == normalized(name):
                continue
            # Preserve Arabic-script variants as the flat source does not identify their languages.
            if candidate == row[1] or re.search(r'[\u0600-\u06ff]', candidate):
                if candidate not in aliases:
                    aliases.append(candidate)
            if len(' '.join(aliases)) >= 1400:
                break
        record = {'name': name, 'region': row[10], 'aliases': ' '.join(aliases), 'population': int(row[14] or 0)}
        key = (normalized(name), row[10])
        previous = cities.get(key)
        if previous is None or record['population'] > previous['population']:
            cities[key] = record

chosen = []
for source_name, region, *presentation in selection:
    record = cities.get((normalized(source_name), region))
    if record is None:
        raise ValueError(f'Curated city missing from source: {source_name}, {region}')
    display_name = presentation[0] if presentation else source_name
    extra_aliases = presentation[1] if len(presentation) > 1 else ''
    aliases = ' '.join(filter(None, [record['aliases'], source_name if display_name != source_name else '', extra_aliases]))
    chosen.append({**record, 'name': display_name, 'aliases': aliases})
ordered = sorted(chosen, key=lambda city: (normalized(city['name']), city['region']))
data = [[city['name'], city['region'], *([city['aliases']] if city['aliases'] else [])] for city in ordered]
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(json.dumps({'places': len(data), 'bytes': output.stat().st_size, 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'regions': sorted({city['region'] for city in ordered})}))
