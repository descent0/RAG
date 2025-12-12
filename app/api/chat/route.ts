import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

interface Source {
  filename: string;
  chunk_text: string;
}

// Define available tools
const tools = [
  {
    type: 'function',
    function: {
      name: 'list_available_files',
      description: 'Get a list of all available PDF files that have been uploaded and can be queried. Use this when the user asks what files are available or what documents they can ask about.',
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
      description: 'Search through uploaded PDF documents to find relevant information. Use this when the user asks questions about specific topics, needs information from documents, or wants to know about content in the PDFs.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant information in the documents',
          },
        },
        required: ['query'],
      },
    },
  },
];

// Tool execution functions
async function listAvailableFiles() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/tools/list-files`);
    const data = await response.json();
    
    if (data.success) {
      const fileNames = data.documents.map((doc: any) => doc.filename).join(', ');
      return fileNames || 'No files available yet.';
    }
    return 'No files available yet.';
  } catch (error) {
    return 'Error fetching files.';
  }
}

async function searchDocuments(query: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/tools/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    
    const data = await response.json();
    
    if (data.success && data.results.length > 0) {
      const results = data.results.slice(0, 3).map((result: any) => {
        const filename = result.documents?.filename || result.filename || 'unknown';
        const text = result.chunk_text || '';
        return `File: ${filename}\nContent: ${text}`;
      }).join('\n\n---\n\n');
      
      return results;
    }
    return 'No relevant information found in the documents.';
  } catch (error) {
    return 'Error searching documents.';
  }
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

    // Prepare messages for Groq with tool calling support
    const messages: any[] = [
      {
        role: 'system',
        content: `You are a RAG assistant. 
You MUST ALWAYS use the provided tools to answer factual questions about PDFs.
NEVER answer from your own knowledge.
If search_documents returns no result, ALWAYS reply:
"No relevant information was found in the uploaded documents."

Rules:
- ONLY answer using retrieved chunk_text.
- ALWAYS mention the filename.
- If user asks anything about personal details like name, contact, etc., answer ONLY if found in documents.
`,
      },
      ...history.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
        ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // First API call - potentially with tool calls
    let completion = await groq.chat.completions.create({
      messages: messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1024,
      tools: tools as any,
      tool_choice: 'required',
    });

    let responseMessage = completion.choices[0]?.message;
    const sources: Source[] = [];
    let usedTools: string[] = [];

    // Handle tool calls if present
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      messages.push(responseMessage);

      // Execute all tool calls
      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments || '{}');
        
        usedTools.push(functionName);
        let toolResult = '';

        if (functionName === 'list_available_files') {
          toolResult = await listAvailableFiles();
        } else if (functionName === 'search_documents') {
          const searchQuery = functionArgs.query;
          toolResult = await searchDocuments(searchQuery);
          
          // Extract sources from search results
          const searchResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/tools/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: searchQuery }),
          });
          
          const searchData = await searchResponse.json();
          if (searchData.success && searchData.results.length > 0) {
            searchData.results.slice(0, 3).forEach((result: any) => {
              const filename = result.documents?.filename || result.filename || 'unknown';
              const chunkText = result.chunk_text || '';
              if (chunkText && !sources.find(s => s.filename === filename)) {
                sources.push({ filename, chunk_text: chunkText });
              }
            });
          }
        }

        // Add tool response to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      // Make second API call with tool results
      completion = await groq.chat.completions.create({
        messages: messages,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 1024,
      });

      responseMessage = completion.choices[0]?.message;
    }

    const assistantMessage = responseMessage?.content || 'No response generated';

    if (usedTools.includes("search_documents") && sources.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No relevant information found in the uploaded documents.",
        sources: [],
        toolsUsed: usedTools,
      });
    }

    // Always return a response at the end
    return NextResponse.json({
      success: true,
      message: assistantMessage,
      sources,
      toolsUsed: usedTools,
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
