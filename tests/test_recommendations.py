"""Integrity checks for the generated experiment, using only the stdlib."""
import hashlib
import json
import sqlite3
import unittest
from datetime import datetime
from pathlib import Path

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

    def test_links_have_real_targets_and_bounded_dates(self):
        for source, links in self.payload['byPost'].items():
            self.assertIn(source, self.posts)
            self.assertLessEqual(len(links), 3)
            self.assertEqual(len({link['id'] for link in links}),len(links))
            for link in links:
                self.assertIn(link['id'], self.posts)
                self.assertNotEqual(source,link['id'])
                delta = abs(datetime.fromisoformat(self.posts[source]['date'])-datetime.fromisoformat(self.posts[link['id']]['date']))
                self.assertLessEqual(delta.total_seconds(),14*86400)
                self.assertGreaterEqual(link['similarity'],self.payload['metadata']['minSimilarity'])

    def test_culture_festival_quote_finds_polka_source(self):
        links = self.payload['byPost']['2096140058835513438']
        self.assertEqual(links[0]['id'],'2096139266762190890')
        self.assertIn('문화제',links[0]['reason'])

    def test_environment_post_has_no_forced_unrelated_recommendation(self):
        # The first loose threshold suggested an unrelated party/pastry post here.
        self.assertNotIn('1945969510659613167',self.payload['byPost'])


if __name__ == '__main__':
    unittest.main()
