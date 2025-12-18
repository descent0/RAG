📄 RAG App — Document-Based Question Answering

A Retrieval-Augmented Generation (RAG) web application built with Next.js that allows users to upload documents and ask questions based on their content using semantic search and LLMs.

🔗 Live Demo: https://rag-ten-pink.vercel.app/

🚀 Features

📤 Upload documents (PDF, DOCX)

🧠 Automatic text extraction & chunking

🔍 Semantic search using vector embeddings

💬 Context-aware AI responses

⚡ Fast UI using Next.js App Router

☁️ Deployed on Vercel (serverless)

🛠 Tech Stack
Frontend

Next.js (App Router)

React

TypeScript

Backend / AI

Gemini Embeddings (text-embedding-004)

Groq LLM (LLaMA 3) for answer generation

Retrieval-Augmented Generation (RAG) pipeline

Database

Supabase (PostgreSQL)

pgvector for similarity search

Infrastructure

Vercel (deployment)

GitHub (PR-based workflow, protected main branch)

🧠 How the RAG Pipeline Works

User uploads a document

Text is extracted and split into chunks

Each chunk is converted into embeddings (Gemini)

Embeddings are stored in Supabase (pgvector)

User asks a question

Relevant chunks are retrieved via vector search

Groq LLM generates a final answer using retrieved context

📦 Getting Started (Local Setup)
1️⃣ Clone the repository
git clone https://github.com/descent0/RAG.git
cd RAG

2️⃣ Install dependencies
npm install
# or
yarn install
# or
pnpm install

3️⃣ Environment Variables

Create a .env.local file:

GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

4️⃣ Run the development server
npm run dev


Open 👉 http://localhost:3000

📂 Project Structure
app/        → UI & API routes (Next.js App Router)
lib/        → Embeddings, retrieval, utilities
public/     → Static assets

🔐 Git & Engineering Practices

Protected main branch

Feature-based branching (feat/*)

PR-based merges

Clean commit history

📈 Future Improvements

Multi-document querying

Chat history per session

User authentication

Improved chunk ranking strategies

Streaming responses
