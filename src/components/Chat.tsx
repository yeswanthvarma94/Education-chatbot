import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User as UserIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { collection, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { generateChatResponse, AIConfig } from '../services/aiService';
import { useFirebase } from './FirebaseProvider';

interface ChatProps {
  chatId: string;
}

export function Chat({ chatId }: ChatProps) {
  const { user } = useFirebase();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId || !user) return;

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', chatId),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `messages for ${chatId}`));

    return () => unsubscribe();
  }, [chatId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !chatId || !user) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      // 1. Save user message
      const userMsgRef = doc(collection(db, 'messages'));
      await setDoc(userMsgRef, {
        id: userMsgRef.id,
        chatId,
        userId: user.uid,
        role: 'user',
        content: userMessage,
        createdAt: serverTimestamp()
      });

      // 2. Fetch Knowledge Base (All global topics)
      const topicsQuery = collection(db, 'topics');
      const topicsSnap = await getDocs(topicsQuery);
      const kbContent = topicsSnap.docs.map(d => `Title: ${d.data().title}\nContent: ${d.data().content}`).join('\n\n');
      
      const systemInstruction = `
        Knowledge Base:
        ${kbContent || 'No topics available. You must respond with "I don\'t have knowledge for this topic." to any question.'}
      `;

      // 3. Fetch User Settings (Model & API Keys)
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      let config: AIConfig = { provider: 'gemini', modelName: 'gemini-3-flash-preview' };
      
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.selectedModel) {
          const [prov, ...rest] = data.selectedModel.split(':');
          config.provider = prov as any;
          config.modelName = rest.join(':');
        }
        if (data.apiKeys && data.apiKeys[config.provider]) {
          config.apiKey = data.apiKeys[config.provider];
        }
      }

      // 4. Prepare message history
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: userMessage });

      // 5. Generate Response
      const responseText = await generateChatResponse(history, config, systemInstruction);

      // 6. Save AI message
      const aiMsgRef = doc(collection(db, 'messages'));
      await setDoc(aiMsgRef, {
        id: aiMsgRef.id,
        chatId,
        userId: user.uid,
        role: 'model',
        content: responseText,
        createdAt: serverTimestamp()
      });

    } catch (error) {
      console.error("Error generating response", error);
      const errorMsgRef = doc(collection(db, 'messages'));
      await setDoc(errorMsgRef, {
        id: errorMsgRef.id,
        chatId,
        userId: user.uid,
        role: 'model',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`,
        createdAt: serverTimestamp()
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!chatId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
        <div className="text-center text-gray-500 p-4">
          <Bot size={48} className="mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-medium">EduChat Storytelling AI</h2>
          <p className="mt-2 text-sm md:text-base">Select a chat or create a new one to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white h-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10 p-4">
            <p className="text-sm md:text-base">Start a conversation! The AI will explain topics based on your Knowledge Base.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Bot size={18} className="text-blue-600" />
              </div>
            )}
            <div className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-3 md:px-5 ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-sm' 
                : 'bg-gray-100 text-gray-800 rounded-tl-sm'
            }`}>
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap text-sm md:text-base">{msg.content}</p>
              ) : (
                <div className="markdown-body prose prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                <UserIcon size={18} className="text-gray-600" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 justify-start">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-blue-600" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 border-t bg-white/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question..."
            className="w-full border border-gray-300 rounded-2xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-12 md:h-14 text-sm md:text-base"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 md:right-2 top-1.5 md:top-2 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
          >
            <Send size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        </div>
        <div className="text-center mt-1 md:mt-2 hidden md:block">
          <p className="text-xs text-gray-400">EduChat AI can make mistakes. Check important info.</p>
        </div>
      </div>
    </div>
  );
}
