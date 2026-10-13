"""Export public translation fields without Discord IDs. Source DB is read-only."""
import sqlite3, json, re
from pathlib import Path
from datetime import datetime, timezone, timedelta
ROOT = Path(__file__).resolve().parent.parent
connection = sqlite3.connect(f'file:{ROOT / "messages.db"}?mode=ro', uri=True)
connection.row_factory = sqlite3.Row
posts = []
for row in connection.execute('SELECT * FROM messages'):
    date = datetime.fromtimestamp(((int(row['tweet_id']) >> 22) + 1288834974657) / 1000, timezone(timedelta(hours=9)))
    media = row['media_urls'] or ''
    try:
        parsed = json.loads(media)
        media = parsed if isinstance(parsed, list) else [parsed] if isinstance(parsed, str) else []
    except (json.JSONDecodeError, TypeError):
        media = re.findall(r'https?://[^\s,\[\]"\']+', media)
    posts.append({'id':row['tweet_id'], 'url':row['tweet_url'], 'handle':row['twitter_handle'], 'original':row['original_text'], 'translation':row['corrected_text'] or row['translated_text'] or '', 'corrected':bool(row['corrected_text']), 'date':date.isoformat(), 'month':date.strftime('%Y-%m'), 'media':[u for u in media if isinstance(u,str) and u.startswith('https://')]})
posts.sort(key=lambda p:p['date'], reverse=True)
(ROOT/'dist').mkdir(exist_ok=True)
(ROOT/'dist'/'data.json').write_text(json.dumps(posts,ensure_ascii=False), encoding='utf-8')
print(f'Exported {len(posts)} posts across {len(set(p["month"] for p in posts))} months')
