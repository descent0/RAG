import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { extractText } from '@/lib/textExtraction';
import { chunkText } from '@/lib/textChunking';
import { getEmbeddings } from '@/lib/embeddings';
export const runtime = 'nodejs';


export async function POST(request: NextRequest) {
  try {
    // Get the file from the request
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const filename = file.name;
    const extension = filename.toLowerCase().split('.').pop();
    if (extension !== 'pdf' && extension !== 'docx') {
      return NextResponse.json(
        { success: false, error: 'Only PDF and DOCX files are supported' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate a unique document ID
    const documentId = randomUUID();
    
    // Determine content type
    const contentType = extension === 'pdf' ? 'pdf' : 'docx';

    // Step 1: Upload file to Supabase Storage
    const storagePath = `${documentId}/${filename}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json(
        { success: false, error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(storagePath);

    const fileUrl = urlData.publicUrl;

    // Step 2: Extract text from the document
    let extractedText: string;
    try {
      extractedText = await extractText(buffer, filename);
    } catch (error) {
      console.error('Text extraction error:', error);
      return NextResponse.json(
        { success: false, error: `Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'No text could be extracted from the document' },
        { status: 400 }
      );
    }

    // Step 3: Chunk the text
    const chunks = chunkText(extractedText, 1000, 200);

    if (chunks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to create text chunks' },
        { status: 500 }
      );
    }

    // Step 4: Get embeddings for all chunks
    const chunkTexts = chunks.map(chunk => chunk.text);
    let embeddings: number[][];
    try {
      embeddings = await getEmbeddings(chunkTexts);
    } catch (error) {
      console.error('Embeddings error:', error);
      return NextResponse.json(
        { success: false, error: `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Step 5: Insert document entry in Supabase documents table first
    try {
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          id: documentId,
          filename: filename,
          content_type: contentType,
          storage_path: storagePath,
        });

      if (dbError) {
        console.error('Supabase insert error:', dbError);
        return NextResponse.json(
          { success: false, error: `Failed to save document metadata: ${dbError.message}` },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { success: false, error: `Failed to save document metadata: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Step 6: Store chunks with embeddings in Supabase document_chunks table
    try {
      const chunkRecords = chunks.map((chunk, i) => ({
        document_id: documentId,
        chunk_text: chunk.text,
        embedding: embeddings[i],
        chunk_index: chunk.index,
      }));

      const { error: chunksError } = await supabase
        .from('document_chunks')
        .insert(chunkRecords);

      if (chunksError) {
        console.error('Supabase chunks insert error:', chunksError);
        return NextResponse.json(
          { success: false, error: `Failed to store chunks: ${chunksError.message}` },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error('Chunks storage error:', error);
      return NextResponse.json(
        { success: false, error: `Failed to store chunks: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      documentId,
      filename,
      chunks: chunks.length,
    });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { success: false, error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
