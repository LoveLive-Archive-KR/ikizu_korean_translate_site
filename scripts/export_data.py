"""Export public translation fields without Discord IDs. Source DB is read-only."""
import sqlite3, json, re
from pathlib import Path
from datetime import datetime, timezone, timedelta
ROOT = Path(__file__).resolve().parent.parent
connection = sqlite3.connect(f'file:{ROOT / "messages.db"}?mode=ro', uri=True)
connection.row_factory = sqlite3.Row
profiles = json.loads((ROOT / "scripts" / "avatar_sources.json").read_text())
names = {"POLKA":"폴카", "MAI":"마이", "AKIRA":"아키라", "HANABI":"하나비", "YUKURI":"유쿠리", "MIRACLE":"미라클", "SHION":"시온", "AURORA":"오로라", "NORIKO":"노리코", "MIDORI":"미도리"}
posts = []
for row in connection.execute('SELECT * FROM messages'):
    date = datetime.fromtimestamp(((int(row['tweet_id']) >> 22) + 1288834974657) / 1000, timezone(timedelta(hours=9)))
    media = (row['media_urls'] if 'media_urls' in row.keys() else '') or ''
    try:
        parsed = json.loads(media)
        media = parsed if isinstance(parsed, list) else [parsed] if isinstance(parsed, str) else []
    except (json.JSONDecodeError, TypeError):
        media = re.findall(r'https?://[^\s,\[\]"\']+', media)
    posts.append({'id':row['tweet_id'], 'url':row['tweet_url'], 'handle':row['twitter_handle'], 'character':row['character_name'], 'name':names.get(row['character_name'], row['character_name'] or row['twitter_handle']), 'avatar':profiles.get(row['twitter_handle'], {}).get('avatar'), 'original':row['original_text'], 'translation':row['corrected_text'] or row['translated_text'] or '', 'corrected':bool(row['corrected_text']), 'date':date.isoformat(), 'month':date.strftime('%Y-%m'), 'media':[u for u in media if isinstance(u,str) and u.startswith('https://')]})
posts.sort(key=lambda p:p['date'], reverse=True)
(ROOT/'dist').mkdir(exist_ok=True)
(ROOT/'dist'/'data.json').write_text(json.dumps(posts,ensure_ascii=False), encoding='utf-8')
print(f'Exported {len(posts)} posts across {len(set(p["month"] for p in posts))} months')
