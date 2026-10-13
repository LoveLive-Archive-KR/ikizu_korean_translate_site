// Local multilingual AI inference. Tweet text never goes to a hosted AI API.
import { pipeline, env } from '@huggingface/transformers';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const model = 'Xenova/multilingual-e5-small';
const revision = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const preprocessingVersion = 3;
const cache = path.join(root, '.cache');
mkdirSync(cache, { recursive: true });
env.cacheDir = path.join(cache, 'models');
const bytes = readFileSync(path.join(root, 'dist/data.json'));
const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
const destination = path.join(cache, 'post-embeddings.json');
if (existsSync(destination)) {
  const previous = JSON.parse(readFileSync(destination));
  if (previous.sourceSha256 === sourceSha256 && previous.revision === revision && previous.preprocessingVersion === preprocessingVersion) {
    console.log('Using cached AI embeddings.');
    process.exit(0);
  }
}
console.log('Loading multilingual E5 model (first run downloads weights).');
const embed = await pipeline('feature-extraction', model, { revision, dtype: 'q8' });
// E5 requires a prefix even for symmetric similarity. Names/dates are deliberately
// omitted so author identity and month do not dominate the semantic vectors.
const posts = JSON.parse(bytes);
const vectors = {};
for (let start = 0; start < posts.length; start += 8) {
  const batch = posts.slice(start, start + 8);
  const texts = batch.map(post => 'query: ' + (post.translation || post.original)
    .replace(/https?:\/\/\S+/g, '').replace(/@[A-Za-z0-9_]+/g, '')
    .replace(/#(?:살기\s*힘든\s*부|いきづらい部|イキヅライブ|이키즈라이브|lovelive)(?![\p{L}\p{N}_])/giu, '')
    .replace(/한 사람 한 사람의 힘은 작을지라도[\s\S]*?작은 초록입니다/g, '')
    .trim());
  const tensor = await embed(texts, { pooling: 'mean', normalize: true, truncation: true, max_length: 256 });
  const values = tensor.tolist();
  batch.forEach((post, index) => { vectors[post.id] = values[index]; });
  if (start % 160 === 0) console.log(`Embedded ${Math.min(start + 8, posts.length)}/${posts.length}`);
}
writeFileSync(destination, JSON.stringify({ model, revision, dtype: 'q8', preprocessingVersion, sourceSha256, vectors }));
console.log(`Saved ${posts.length} AI embeddings locally.`);
