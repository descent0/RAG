// lib/embeddings.ts
import { pipeline } from '@xenova/transformers';

let embedder: any;

/**
 * Load embedding model once (singleton)
 */
async function loadEmbedder() {
  if (!embedder) {
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }
  return embedder;
}

/**
 * Generate embeddings for text chunks
 */
export async function getEmbedding (
  texts: string[]
): Promise<number[][]> {
  const extractor = await loadEmbedder();
  const vectors: number[][] = [];

  for (const text of texts) {
    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    vectors.push(Array.from(output.data));
  }

  return vectors;
}
