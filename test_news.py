import requests, json
r = requests.get('http://127.0.0.1:5001/api/news', timeout=60)
d = r.json()
print('Status:', r.status_code)
print('Count:', d.get('count', 0))
print('Regions:', d.get('regions', []))
arts = d.get('articles', [])

# Count by region
from collections import Counter
region_counts = Counter(a.get('region', 'Unknown') for a in arts)
print('\nBy region:')
for region, count in region_counts.most_common():
    print(f'  {region}: {count}')

# Count by source
source_counts = Counter(a.get('source', 'Unknown') for a in arts)
print('\nBy source:')
for source, count in source_counts.most_common(15):
    print(f'  {source}: {count}')

# Show some Indian articles
india_arts = [a for a in arts if a.get('region') == 'India']
print(f'\n--- Indian Articles ({len(india_arts)}) ---')
for a in india_arts[:10]:
    print(f'  [{a.get("source", "?")}] {a["title"][:75]}')
