// Search every archived post, without a month/date window. Keep the strongest
// semantic candidates; context gates and diversity are applied by the DB builder.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
const embeddings = JSON.parse(readFileSync(cache + 'post-embeddings.json'));
const items = Object.entries(embeddings.vectors).map(([id, vector]) => [id, Float32Array.from(vector)]);
const neighbors = Object.fromEntries(items.map(([id]) => [id, []]));
for (let i = 0; i < items.length; i++) {
  const [sourceId, a] = items[i];
  for (let j = i + 1; j < items.length; j++) {
    const [targetId, b] = items[j];
    let similarity = 0;
    for (let k = 0; k < a.length; k++) similarity += a[k] * b[k];
    if (similarity >= 0.88) {
      neighbors[sourceId].push({ id: targetId, similarity });
      neighbors[targetId].push({ id: sourceId, similarity });
    }
  }
  if (i % 400 === 0) console.log(`Searched all dates: ${i}/${items.length}`);
}
for (const id of Object.keys(neighbors)) {
  neighbors[id].sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));
  // Retain all qualifying neighbors: contextual ranking must not lose nearby
  // follow-up posts behind repeated greetings from unrelated dates.
}
writeFileSync(cache + 'post-neighbors.json', JSON.stringify({ sourceSha256: embeddings.sourceSha256, revision: embeddings.revision, preprocessingVersion: embeddings.preprocessingVersion, neighbors }));
console.log(`Compared every pair across ${items.length} posts.`);
