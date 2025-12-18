import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { langfuse } from '@/lib/langfuse';
import { getSystemPrompt } from '@/lib/systemPrompt';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface Source {
  filename: string;
  chunk_text: string;
}

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
  let trace: any = null;
  try {
    const { message, history = [], documentId } = await req.json();

    if (!message || !documentId) {
      return NextResponse.json(
        { success: false, error: 'message & documentId required' },
        { status: 400 }
      );
    }

    // Start Trace
    trace = langfuse.trace({
      name: "chat-request",
      input: { userMessage: message },
    });

    // Attach System Prompt
    const systemPrompt = await getSystemPrompt();
    trace.span({
      name: "system-prompt",
      input: systemPrompt,
    });

    //  SANITIZE HISTORY
    const sanitizedHistory = history.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const messages: any[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...sanitizedHistory,
      { role: 'user', content: message },
    ];

    // Trace the LLM Call
    const generation = trace.generation({
      name: "llm-decision",
      model: "groq-llama",
      input: messages,
    });

    // 🟢 FIRST CALL — tools enabled
    let completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages,
      tools,
      tool_choice: 'auto',
    });

    let response = completion.choices[0].message;

    generation.end({
      output: response,
    });

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
        }
      }
    }

    if (toolCalls.length) {
      messages.push(response);

      for (const call of toolCalls) {
        const args = JSON.parse(call.function.arguments);
        toolsUsed.push(call.function.name);

        // Trace tool selected
        trace.span({
          name: "tool-selected",
          input: call.function.name,
        });

        let result = '';

        if (call.function.name === 'list_available_files') {
          result = await listAvailableFiles();
          trace.span({
            name: "list-files",
            output: result,
          });
        }

        if (call.function.name === 'search_documents') {
          const toolSpan = trace.span({
            name: "search-documents",
            input: args.query,
          });
          // documentId comes from backend, NOT model
          console.log('Calling searchDocuments with query:', args.query, 'documentId:', documentId);
          result = await searchDocuments(args.query, documentId);
          console.log('Search result:', result);
          toolSpan.end({
            output: result,
          });
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      }

      completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages,
        tool_choice: 'none',
      });

      response = completion.choices[0].message;

      // Final LLM Answer
      trace.generation({
        name: "final-answer",
        input: messages,  
        output: response.content,
      });
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
