import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Source {
  filename: string;
  chunk_text: string;
}

export async function POST(request: NextRequest) {
  try {
    const { message, history = [] } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Detect if RAG mode should be used
    const isRAGMode = message.endsWith('?') || message.toLowerCase().includes('explain');

    let finalMessage = message;
    let sources: Source[] = [];

    if (isRAGMode) {
      // Call search API to get relevant chunks
      const searchResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/tools/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: message }),
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        
        if (searchData.success && searchData.results.length > 0) {
          // Build context from search results
          const contextParts: string[] = [];
          const sourceMap = new Map<string, Source>();

          searchData.results.forEach((result: any) => {
            const filename = result.documents?.filename || result.filename || 'unknown';
            const chunkText = result.chunk_text || '';
            
            if (chunkText) {
              contextParts.push(`${chunkText}\n(source: ${filename})`);
              if (!sourceMap.has(filename)) {
                sourceMap.set(filename, { filename, chunk_text: chunkText });
              }
            }
          });

          sources = Array.from(sourceMap.values());

          // Build enhanced prompt with context
          finalMessage = `Use only the following context to answer the question. Include the source filename at the end of your answer.

Context:
${contextParts.join('\n\n')}

Question: ${message}`;
        }
      }
    }

    // Prepare messages for Groq
    const messages: Message[] = [
      {
        role: 'system',
        content: isRAGMode
          ? 'You are a helpful assistant that answers questions based on the provided context. Always cite your sources.'
          : 'You are a helpful assistant. Provide clear and concise answers.',
      },
      ...history.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: finalMessage,
      },
    ];

    // Call Groq API
    const completion = await groq.chat.completions.create({
      messages: messages as any,
      model: 'llama3-8b-8192', // Fast model (note: correct model name)
      temperature: 0.7,
      max_tokens: 1024,
    });

    const assistantMessage = completion.choices[0]?.message?.content || 'No response generated';

    return NextResponse.json({
      success: true,
      message: assistantMessage,
      sources: sources.length > 0 ? sources : undefined,
      ragMode: isRAGMode,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to process chat' 
      },
      { status: 500 }
    );
  }
}
