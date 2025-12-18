import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Gemini embedding model (HTTP-based, no native binaries)
const model = genAI.getGenerativeModel({
  model: "text-embedding-004",
});

/**
 * Generate embeddings for text chunks
 */
export async function getEmbedding(
  texts: string[]
): Promise<number[][]> {
  const vectors: number[][] = [];

  for (const text of texts) {
    const result = await model.embedContent(text);

    vectors.push(result.embedding.values);
  }

  return vectors;
}
