import { langfuse } from "./langfuse";

export async function getSystemPrompt(){
    const systemPrompt = await langfuse.getPrompt("rag-system-prompt");
    // Ensure it's a string
    const content = typeof systemPrompt.prompt === 'string' ? systemPrompt.prompt : JSON.stringify(systemPrompt.prompt);
    return content;
}