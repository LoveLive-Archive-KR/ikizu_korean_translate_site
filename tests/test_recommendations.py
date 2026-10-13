"""Integrity checks for the generated experiment, using only the stdlib."""
import hashlib
import json
import sqlite3
import unittest
from datetime import datetime
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent


class RecommendationsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (ROOT / 'dist/data.json').read_bytes()
        cls.posts = {p['id']:p for p in json.loads(cls.raw)}
        cls.payload = json.loads((ROOT / 'dist/recommendations.json').read_text())

    def test_current_archive_and_database_export_agree(self):
        self.assertEqual(self.payload['metadata']['sourceSha256'], hashlib.sha256(self.raw).hexdigest())
        with sqlite3.connect(f'file:{ROOT / "recommendations.db"}?mode=ro', uri=True) as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            rows = db.execute('SELECT source_id,target_id,rank,similarity,reason FROM recommendations ORDER BY source_id,rank').fetchall()
        exported = [(source,entry['id'],rank,entry['similarity'],entry['reason'])
                          for source,links in self.payload['byPost'].items()
                          for rank,entry in enumerate(links,1)]
        exported.sort(key=lambda row: (row[0],row[2]))
        self.assertEqual(rows, exported)
        self.assertEqual(len(rows), self.payload['metadata']['links'])

    def test_links_have_real_targets_and_valid_similarity(self):
        for source, links in self.payload['byPost'].items():
            self.assertIn(source, self.posts)
            self.assertLessEqual(len(links), 3)
            self.assertEqual(len({link['id'] for link in links}),len(links))
            for link in links:
                self.assertIn(link['id'], self.posts)
                self.assertNotEqual(source,link['id'])
                self.assertGreaterEqual(link['similarity'],self.payload['metadata']['minSimilarity'])

    def test_all_recorded_months_have_recommendations(self):
        totals = Counter(p['month'] for p in self.posts.values())
        coverage = Counter(self.posts[source]['month'] for source in self.payload['byPost'])
        self.assertEqual(set(totals),set(coverage))
        for month,total in totals.items():
            self.assertGreaterEqual(coverage[month]/total,0.5,month)

    def test_candidates_cross_months_and_old_date_window(self):
        self.assertIsNone(self.payload['metadata']['windowDays'])
        links = self.payload['byPost']['1906681633169711221']
        self.assertTrue(any(abs(datetime.fromisoformat(self.posts['1906681633169711221']['date'])-
                                   datetime.fromisoformat(self.posts[link['id']]['date'])).days > 14
                            for link in links))

    def test_culture_festival_quote_finds_polka_source(self):
        links = self.payload['byPost']['2096140058835513438']
        self.assertEqual(links[0]['id'],'2096139266762190890')
        self.assertIn('문화제',links[0]['reason'])

    def test_environment_post_avoids_unrelated_party_posts(self):
        # The first loose threshold suggested an unrelated party/pastry post here.
        links = self.payload['byPost']['1945969510659613167']
        for link in links:
            target = self.posts[link['id']]['translation']
            self.assertNotIn('여름은 여기도 저기도 이벤트 시즌',target)
            self.assertNotIn('이렇게 반짝거리는 사람들과 같이 SNS에서 활동',target)


if __name__ == '__main__':
    unittest.main()
