import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

// ✅ BASE URL FIX
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface Source {
  filename: string;
  chunk_text: string;
}

// ---------------- TOOLS ----------------

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_available_files',
      description: 'List all uploaded documents',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description: 'Search inside the currently active document',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
];

// ---------------- TOOL EXECUTORS ----------------

async function listAvailableFiles() {
  const res = await fetch(`${BASE_URL}/api/tools/list-files`);
  const data = await res.json();
  return data?.documents?.map((d: any) => d.filename).join(', ') || 'No files';
}

async function searchDocuments(query: string, documentId: string) {
  console.log('Searching documents with query:', query, 'documentId:', documentId);
  const res = await fetch(`${BASE_URL}/api/tools/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documentId }),
  });

  const data = await res.json();
  console.log('Search response data:', data);

  if (!data.success || data.results.length === 0) {
    console.log('No relevant information found - success:', data.success, 'results length:', data.results?.length);
    return 'No relevant information was found in the uploaded document.';
  }

  const results = data.results
    .slice(0, 3)
    .map(
      (r: any) =>
        `File: ${r.documents.filename}\nContent: ${r.chunk_text}`
    )
    .join('\n\n---\n\n');
  console.log('Returning search results:', results);
  return results;
}

// ---------------- CHAT HANDLER ----------------

export async function POST(req: NextRequest) {
  try {
    const { message, history = [], documentId } = await req.json();

    if (!message || !documentId) {
      return NextResponse.json(
        { success: false, error: 'message & documentId required' },
        { status: 400 }
      );
    }

    // 🔒 SANITIZE HISTORY
    const sanitizedHistory = history.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const messages: any[] = [
      {
        role: 'system',
        content: `
You are a document-specific RAG assistant.

Rules:
- ONLY use retrieved chunk_text
- NEVER mix documents
- ALWAYS mention filename
- Always use the search_documents tool to answer questions about the document content.
        `,
      },
      ...sanitizedHistory,
      { role: 'user', content: message },
    ];

    // 🟢 FIRST CALL — tools enabled
    let completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      tools,
      tool_choice: 'auto',
    });

    let response = completion.choices[0].message;
    const toolsUsed: string[] = [];

    // Handle malformed function calls
    let toolCalls = response.tool_calls || [];
    if (!toolCalls.length && response.content && response.content.includes('<function=')) {
      const match = response.content.match(/<function=(\w+)>\{(.+)\}/);
      if (match) {
        const funcName = match[1];
        const argsStr = match[2];
        try {
          const args = JSON.parse(`{${argsStr}}`);
          toolCalls = [{
            id: 'manual-' + Date.now(),
            function: {
              name: funcName,
              arguments: JSON.stringify(args),
            },
            type: 'function',
          }];
          response.content = response.content.replace(/<function=.+>/, '').trim();
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    if (toolCalls.length) {
      messages.push(response);

      for (const call of toolCalls) {
        const args = JSON.parse(call.function.arguments);
        toolsUsed.push(call.function.name);

        let result = '';

        if (call.function.name === 'list_available_files') {
          result = await listAvailableFiles();
        }

        if (call.function.name === 'search_documents') {
          // 🚨 documentId comes from backend, NOT model
          console.log('Calling searchDocuments with query:', args.query, 'documentId:', documentId);
          result = await searchDocuments(args.query, documentId);
          console.log('Search result:', result);
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      }

      // 🔴 SECOND CALL — tools DISABLED (THIS FIXES YOUR ERROR)
      completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages,
        tool_choice: 'none',
      });

      response = completion.choices[0].message;
    }

    return NextResponse.json({
      success: true,
      message: response.content,
      toolsUsed,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
