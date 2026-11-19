"""Rebuild both app datasets from the official ISTAT workbook (Python stdlib only)."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import io
import json
import re
import sys
import urllib.request

SOURCE = 'https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx'
REFERENCE = 'https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/'
raw = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(SOURCE, timeout=60).read()
ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(io.BytesIO(raw)) as archive:
    strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('x:si', ns)]
    rows = []
    for row in ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('x:sheetData/x:row', ns):
        values = {}
        for cell in row.findall('x:c', ns):
            value = cell.find('x:v', ns)
            text = value.text if value is not None else ''
            values[re.sub(r'\d', '', cell.attrib['r'])] = strings[int(text)] if cell.get('t') == 's' and text else text
        rows.append(values)
assert 'Denominazione in italiano' in rows[0].values() and rows[0]['O'] == 'Sigla automobilistica'
entries = set()
municipality_count = 0
for row in rows[1:]:
    if not row.get('G'):
        continue
    municipality_count += 1
    province = row.get('O', '')
    if not re.fullmatch('[A-Z]{2}', province):
        continue
    for column in ['F', 'G', 'H']:
        if row.get(column):
            entries.add((row[column], province))
assert municipality_count > 7800 and len(entries) > 7800
content = f'// Fonte: ISTAT. Elenco comuni aggiornato al 21 febbraio 2026.\n// {REFERENCE}\n// Generato da scripts/update-italian-municipalities.py; nessuna richiesta esterna durante la compilazione.\n'
content += 'export const ITALIAN_MUNICIPALITIES: ReadonlyArray<readonly [string, string]> = [\n'
content += ',\n'.join('  ' + json.dumps(entry, ensure_ascii=False) for entry in sorted(entries)) + '\n];\n'
root = Path(__file__).resolve().parents[2]
for app in ['MVanager-frontend', 'MVControlManager-frontend']:
    target = root / app / 'src/app/shared/italian-municipalities/municipalities.data.ts'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
print(f'{municipality_count} comuni letti, {len(entries)} denominazioni con sigla provinciale disponibile.')
