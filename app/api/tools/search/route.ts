import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getEmbedding } from '@/lib/embeddings';


export async function POST(request: NextRequest) {
  try {
    const { query, documentId } = await request.json();
    console.log('Search API called with query:', query, 'documentId:', documentId);

    // ---------------- VALIDATION ----------------
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Query text is required' },
        { status: 400 }
      );
    }

    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'documentId is required' },
        { status: 400 }
      );
    }

    // ---------------- EMBEDDING (FIXED) ----------------
    const [queryEmbedding] = await getEmbedding([query]);
    console.log('Generated embedding for query:', queryEmbedding);

    // ---------------- VECTOR SEARCH (RPC) ----------------
    const { data, error } = await supabase.rpc(
      'match_document_chunks',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.0,
        match_count: 10,
        doc_id: documentId,
      }
    );
    console.log('Vector search result - data:', data, 'error:', error);

    // ---------------- GET DOCUMENT FILENAME ----------------
    const { data: document } = await supabase
      .from('documents')
      .select('filename')
      .eq('id', documentId)
      .single();

    const filename = document?.filename || 'unknown';
    console.log('Retrieved filename:', filename);

    // Check total chunks for this document
    const { count } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);
    console.log('Total chunks for document:', count);

    // ---------------- RPC ERROR → FALLBACK ----------------
    if (error) {
      console.error('Similarity search error:', error);

      const { data: fallbackChunks, error: fallbackError } = await supabase
        .from('document_chunks')
        .select('id, chunk_text, document_id')
        .eq('document_id', documentId)
        .limit(10);

      console.log('Fallback chunks:', fallbackChunks, 'fallbackError:', fallbackError);

      if (fallbackError) {
        return NextResponse.json(
          { success: false, error: 'Failed to search chunks' },
          { status: 500 }
        );
      }

      const results = (fallbackChunks || []).map((chunk) => ({
        id: chunk.id,
        chunk_text: chunk.chunk_text,
        document_id: chunk.document_id,
        documents: { filename },
      }));

      console.log('Returning fallback results:', results);
      return NextResponse.json({
        success: true,
        results,
        fallback: true,
      });
    }

    // ---------------- SUCCESS RESPONSE ----------------
    const results = (data || []).map((chunk: any) => ({
      id: chunk.id,
      chunk_text: chunk.chunk_text,
      document_id: chunk.document_id,
      similarity: chunk.similarity,
      documents: { filename },
    }));

    console.log('Returning vector search results:', results);
    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}
