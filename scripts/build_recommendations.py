"""Build a separate SQLite recommendation DB and its public JSON export."""
import hashlib
import json
import math
import re
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DAY = 86400
MODEL_WINDOW_DAYS = 14
MIN_SIMILARITY = 0.92
TOPICS = {
    "문화제": ("문화제", "文化祭"), "연습": ("연습", "練習"),
    "공연": ("라이브", "ライブ", "공연"), "시험": ("시험", "テスト", "試験"),
    "생일": ("생일", "誕生日"), "수학여행": ("수학여행", "修学旅行"),
    "크리스마스": ("크리스마스", "クリスマス"), "할로윈": ("할로윈", "ハロウィン"),
    "졸업": ("졸업", "卒業"), "축제": ("축제", "祭り"),
}
IGNORED_TAGS = {"살기힘든부", "いきづらい部", "イキヅライブ", "이키즈라이브", "lovelive"}


def clean(text):
    return re.sub(r"\s+", " ", re.sub(r"https?://\S+|@[A-Za-z0-9_]+|#[\w]+", "", text)).strip()


def features(post):
    text = f'{post["translation"]}\n{post["original"]}'
    tags = set(re.findall(r"#([\w]+)", text.lower())) - {x.lower() for x in IGNORED_TAGS}
    topics = {label for label, words in TOPICS.items() if any(word in text for word in words)}
    # Character trigrams tolerate Korean inflection without a separate tokenizer.
    words = re.findall(r"[가-힣]{3,}|[一-龯ぁ-んァ-ン]{3,}|[a-z]{4,}", clean(text).lower())
    grams = {word[i:i+3] for word in words for i in range(len(word)-2)}
    return tags, topics, grams


def build():
    raw = (ROOT / "dist/data.json").read_bytes()
    fingerprint = hashlib.sha256(raw).hexdigest()
    posts = sorted(json.loads(raw), key=lambda p: (p["date"], int(p["id"])))
    embeddings = json.loads((ROOT / ".cache/post-embeddings.json").read_text())
    if embeddings["sourceSha256"] != fingerprint:
        raise ValueError("Stale embeddings: run npm run recommendations:embed first")
    vectors = embeddings["vectors"]
    if set(vectors) != {p["id"] for p in posts}:
        raise ValueError("Embedding IDs do not match the current archive")
    if any(not all(math.isfinite(v) for v in vector) for vector in vectors.values()):
        raise ValueError("Non-finite embedding")
    times = [datetime.fromisoformat(p["date"]).timestamp() for p in posts]
    feats = [features(p) for p in posts]
    frequency = Counter(gram for _, _, grams in feats for gram in grams)
    rows = []
    for i, source in enumerate(posts):
        if len(clean(source["translation"] or source["original"])) < 14:
            continue
        candidates = []
        for j, target in enumerate(posts):
            gap = abs(times[i] - times[j])
            if i == j or gap > MODEL_WINDOW_DAYS * DAY:
                continue
            if len(clean(target["translation"] or target["original"])) < 14:
                continue
            same_author = source["handle"] == target["handle"]
            if same_author and gap > 2 * DAY:
                continue
            shared_tags = feats[i][0] & feats[j][0]
            shared_topics = feats[i][1] & feats[j][1]
            shared_grams = {g for g in feats[i][2] & feats[j][2] if 2 <= frequency[g] <= 70}
            if not (shared_tags or shared_topics or shared_grams):
                continue
            similarity = sum(a*b for a,b in zip(vectors[source["id"]], vectors[target["id"]]))
            threshold = max(MIN_SIMILARITY, 0.95 if same_author else 0.94 if not (shared_tags or shared_topics) else MIN_SIMILARITY)
            if not (shared_tags or shared_topics) and len(shared_grams) < 2:
                continue
            if similarity < threshold or (gap > 3*DAY and not (shared_tags or shared_topics)):
                continue
            if clean(source["translation"]) == clean(target["translation"]):
                continue
            same_day = source["date"][:10] == target["date"][:10]
            if shared_tags:
                reason = f'공통 해시태그 #{sorted(shared_tags)[0]}'
            elif shared_topics:
                reason = f'{sorted(shared_topics)[0]} 언급 · 내용 의미가 비슷함'
            else:
                reason = '내용 의미가 비슷함'
            reason += ' · 같은 날' if same_day else f' · {max(1, math.ceil(gap/DAY))}일 이내'
            score = similarity + 0.018*math.exp(-gap/(2*DAY)) + (0.008 if not same_author else 0)
            candidates.append((score, target, similarity, reason))
        candidates.sort(key=lambda c: (-c[0], c[1]["date"], int(c[1]["id"])))
        # Avoid filling the entire list with one member's near-identical posts.
        author_counts = Counter()
        rank = 0
        for score, target, similarity, reason in candidates:
            if author_counts[target["handle"]] >= 2:
                continue
            rank += 1
            author_counts[target["handle"]] += 1
            rows.append((source["id"], target["id"], rank, round(similarity, 6), reason))
            if rank == 3:
                break
    metadata = {
        "schemaVersion": 1, "model": embeddings["model"], "revision": embeddings["revision"],
        "dtype": embeddings["dtype"], "sourceSha256": fingerprint,
        "generatedAt": datetime.now(timezone.utc).isoformat(), "algorithm": "semantic-time-anchors-v1",
        "minSimilarity": MIN_SIMILARITY, "windowDays": MODEL_WINDOW_DAYS,
        "unanchoredMinSimilarity": 0.94, "sameAuthorMinSimilarity": 0.95,
        "sourcePosts": len(posts), "links": len(rows),
    }
    db = ROOT / "recommendations.db"
    with sqlite3.connect(db) as connection:
        connection.executescript('''
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS recommendations (
                source_id TEXT NOT NULL, target_id TEXT NOT NULL, rank INTEGER NOT NULL,
                similarity REAL NOT NULL, reason TEXT NOT NULL,
                PRIMARY KEY (source_id, target_id), UNIQUE (source_id, rank),
                CHECK (source_id != target_id), CHECK (rank BETWEEN 1 AND 3)
            );
            DELETE FROM metadata;
            DELETE FROM recommendations;
        ''')
        connection.executemany('INSERT INTO metadata VALUES (?,?)', [(k,json.dumps(v,ensure_ascii=False)) for k,v in metadata.items()])
        connection.executemany('INSERT INTO recommendations VALUES (?,?,?,?,?)', rows)
        connection.execute('PRAGMA user_version=1')
    with sqlite3.connect(db) as connection:
        connection.execute('VACUUM')
    by_post = {}
    for source_id, target_id, rank, similarity, reason in rows:
        by_post.setdefault(source_id, []).append({"id":target_id, "reason":reason, "similarity":similarity})
    output = {"metadata":metadata, "byPost":by_post}
    (ROOT / "dist/recommendations.json").write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Built {len(rows)} AI links for {len(by_post)}/{len(posts)} posts in separate DB + JSON.')


if __name__ == '__main__':
    build()
