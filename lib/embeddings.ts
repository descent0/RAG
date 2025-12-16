export interface Embedding {
  values: number[];
}

// Simple hash-based embedding fallback (for development/testing)
function simpleEmbedding(text: string, dimensions: number = 768): number[] {
  const embedding = new Array(dimensions).fill(0);
  const normalized = text.toLowerCase();
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    const index = char % dimensions;
    embedding[index] += Math.sin(char + i);
  }
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / (magnitude || 1));
}

export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  
  // If no API key, use simple fallback
  if (!apiKey) {
    console.warn('HUGGINGFACE_API_KEY not set, using simple embedding fallback');
    return simpleEmbedding(text);
  }

  const model = 'sentence-transformers/all-MiniLM-L6-v2';
  const apiUrl = `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        options: {
          wait_for_model: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HuggingFace API error:', response.status, errorText);
      console.warn('Falling back to simple embedding');
      return simpleEmbedding(text);
    }

    const result = await response.json();
    
    // The API returns the embedding as an array
    if (Array.isArray(result)) {
      return result.flat() as number[];
    }
    
    return result;
  } catch (error) {
    console.error('HuggingFace API error:', error);
    console.warn('Falling back to simple embedding');
    return simpleEmbedding(text);
  }
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings = await Promise.all(
    texts.map(text => getEmbedding(text))
  );
  return embeddings;
}
