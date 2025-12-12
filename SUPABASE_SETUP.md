# Supabase Setup for RAG Chatbot

## Database Function for Similarity Search

Run this SQL in your Supabase SQL Editor to create the similarity search function:

```sql
-- Create the similarity search function
create or replace function match_document_chunks (
  query_embedding vector(768),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  chunk_text text,
  chunk_index int,
  similarity float,
  filename text
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.filename
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
```

## Environment Variables Required

Add these to your `.env.local` file:

```env
# Groq API Key
GROQ_API_KEY=your_groq_api_key_here

# Base URL (for production deployment)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Getting a Groq API Key

1. Go to https://console.groq.com/
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy and paste into your `.env.local` file

## Testing the Setup

1. Upload a PDF or DOCX file at `/`
2. Go to `/chat`
3. Ask a question with `?` at the end or include "explain"
4. The bot will use RAG mode to search your documents and provide sourced answers

## Available LLM Models

- `llama3-8b-8192` - Fast, balanced (default)
- `llama3-70b-8192` - Higher quality, slower
- `mixtral-8x7b-32768` - Good for longer contexts
