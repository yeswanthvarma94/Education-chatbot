import { GoogleGenAI } from '@google/genai';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'azure';

export interface AIConfig {
  provider: ModelProvider;
  modelName: string;
  apiKey?: string; // For custom keys
}

export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
}

export async function extractFileKnowledge(base64Data: string, mimeType: string, config: AIConfig): Promise<string> {
  if (config.provider === 'gemini') {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key is missing");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: "Extract all educational information, text, concepts, and descriptions from this document/image so it can be used in a knowledge base." }
          ]
        }
      ]
    });
    return response.text || '';
  }
  throw new Error("File extraction is currently only supported with Gemini.");
}

export async function generateChatResponse(
  messages: Message[],
  config: AIConfig,
  systemInstruction?: string
): Promise<string> {
  // Always inject the strict knowledge base instruction
  const strictInstruction = `
    You are an educational chatbot. You explain topics using interactive storytelling and real-life analogies.
    You MUST strictly adhere to the provided knowledge base.
    If the user asks about a topic outside the knowledge base, respond EXACTLY with: 'I don't have knowledge for this topic.'
    
    ${systemInstruction || ''}
  `;

  if (config.provider === 'gemini') {
    // Use the provided API key or fallback to the environment one
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key is missing");
    
    const ai = new GoogleGenAI({ apiKey });
    
    // Format messages for Gemini
    const formattedMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    
    // We use generateContent with history
    const response = await ai.models.generateContent({
      model: config.modelName || 'gemini-3-flash-preview',
      contents: formattedMessages,
      config: {
        systemInstruction: strictInstruction,
        tools: [{ googleSearch: {} }], // Enable search grounding
      }
    });
    
    return response.text || '';
  } 
  else if (config.provider === 'openai') {
    if (!config.apiKey) throw new Error("OpenAI API key is required");
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.modelName || 'gpt-4o',
        messages: [
          { role: 'system', content: strictInstruction },
          ...messages.map(m => ({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.content
          }))
        ]
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  }
  else if (config.provider === 'anthropic') {
    if (!config.apiKey) throw new Error("Anthropic API key is required");
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: config.modelName || 'claude-3-5-sonnet-20240620',
        system: strictInstruction,
        max_tokens: 4096,
        messages: messages.filter(m => m.role !== 'system').map(m => ({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content
        }))
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Anthropic API error');
    }
    
    const data = await response.json();
    return data.content[0].text;
  }
  
  throw new Error(`Provider ${config.provider} is not fully implemented yet.`);
}
