import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embeddings';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Query text is required' },
        { status: 400 }
      );
    }

    // Generate embedding for the query
    const queryEmbedding = await getEmbedding(query);

    // Perform similarity search using pgvector
    // Note: Supabase uses <-> operator for cosine distance
    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5,
    });

    if (error) {
      console.error('Similarity search error:', error);
      
      // Fallback: if RPC doesn't exist, do a basic query
      const { data: chunks, error: fallbackError } = await supabase
        .from('document_chunks')
        .select(`
          id,
          chunk_text,
          document_id,
          chunk_index,
          documents (
            id,
            filename
          )
        `)
        .limit(5);

      if (fallbackError) {
        return NextResponse.json(
          { success: false, error: 'Failed to search chunks' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        results: chunks || [],
        fallback: true,
      });
    }

    return NextResponse.json({
      success: true,
      results: data || [],
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}
