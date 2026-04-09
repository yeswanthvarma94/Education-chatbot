import React, { useState, useEffect, useRef } from 'react';
import { Plus, MessageSquare, BookOpen, Settings, LogOut, Trash2, Upload, X, Loader2 } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, orderBy, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useFirebase } from './FirebaseProvider';
import { extractFileKnowledge, AIConfig } from '../services/aiService';

interface SidebarProps {
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onOpenSettings: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function Sidebar({ currentChatId, onSelectChat, onOpenSettings, isOpen, setIsOpen }: SidebarProps) {
  const { user, userRole, logOut } = useFirebase();
  const [chats, setChats] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'chats' | 'kb'>('chats');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicContent, setNewTopicContent] = useState('');
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    const chatsQuery = query(
      collection(db, 'chats'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubChats = onSnapshot(chatsQuery, (snap) => {
      setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'chats'));

    let unsubTopics = () => {};
    if (userRole === 'admin') {
      const topicsQuery = query(
        collection(db, 'topics'),
        orderBy('createdAt', 'desc')
      );
      unsubTopics = onSnapshot(topicsQuery, (snap) => {
        setTopics(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'topics'));
    }

    return () => {
      unsubChats();
      unsubTopics();
    };
  }, [user, userRole]);

  const createNewChat = async () => {
    if (!user) return;
    try {
      const newChatRef = doc(collection(db, 'chats'));
      await setDoc(newChatRef, {
        id: newChatRef.id,
        userId: user.uid,
        title: 'New Conversation',
        createdAt: serverTimestamp()
      });
      onSelectChat(newChatRef.id);
      setIsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'chats', id));
      if (currentChatId === id) onSelectChat('');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${id}`);
    }
  };

  const processFile = async (file: File): Promise<string> => {
    if (file.type.startsWith('text/') || file.name.endsWith('.csv') || file.name.endsWith('.md')) {
      const text = await file.text();
      return `\n\n--- Content from ${file.name} ---\n${text}`;
    } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      
      const userRef = doc(db, 'users', user!.uid);
      const userSnap = await getDoc(userRef);
      let config: AIConfig = { provider: 'gemini', modelName: 'gemini-3-flash-preview' };
      if (userSnap.exists() && userSnap.data().apiKeys) {
         config.apiKey = userSnap.data().apiKeys.gemini;
      }
      
      const extractedText = await extractFileKnowledge(base64, file.type, config);
      return `\n\n--- Information extracted from ${file.name} ---\n${extractedText}`;
    }
    return '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    
    setIsExtracting(true);
    try {
      let extractedText = '';
      for (let i = 0; i < files.length; i++) {
        extractedText += await processFile(files[i]);
      }
      setNewTopicContent(prev => prev + extractedText);
    } catch (error) {
      console.error("Error extracting file content", error);
      alert("Failed to extract content from some files.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    
    setIsExtracting(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const extractedText = await processFile(file);
        
        if (extractedText.trim()) {
          const newTopicRef = doc(collection(db, 'topics'));
          await setDoc(newTopicRef, {
            id: newTopicRef.id,
            userId: user.uid,
            title: file.name,
            content: extractedText.trim(),
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.error("Error extracting file content", error);
      alert("Failed to extract content from some files.");
    } finally {
      setIsExtracting(false);
      if (directFileInputRef.current) directFileInputRef.current.value = '';
    }
  };

  const addTopic = async () => {
    if (!user || !newTopicTitle || !newTopicContent) return;
    try {
      const newTopicRef = doc(collection(db, 'topics'));
      await setDoc(newTopicRef, {
        id: newTopicRef.id,
        userId: user.uid,
        title: newTopicTitle,
        content: newTopicContent,
        createdAt: serverTimestamp()
      });
      setNewTopicTitle('');
      setNewTopicContent('');
      setIsAddingTopic(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'topics');
    }
  };

  const deleteTopic = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'topics', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `topics/${id}`);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 text-white flex flex-col h-full transform transition-transform duration-200 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-4 flex items-center justify-between md:hidden">
          <span className="font-bold text-lg">Menu</span>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-800 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex gap-2 border-b border-gray-800 md:border-none">
          <button 
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'chats' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            Chats
          </button>
          {userRole === 'admin' && (
            <button 
              onClick={() => setActiveTab('kb')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'kb' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
            >
              Knowledge Base
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeTab === 'chats' ? (
            <>
              <button 
                onClick={createNewChat}
                className="w-full flex items-center gap-2 px-3 py-3 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors text-sm"
              >
                <Plus size={16} />
                New Chat
              </button>
              
              <div className="mt-4 space-y-1">
                {chats.map(chat => (
                  <div 
                    key={chat.id}
                    onClick={() => { onSelectChat(chat.id); setIsOpen(false); }}
                    className={`group flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors text-sm ${currentChatId === chat.id ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <MessageSquare size={16} className="text-gray-400 shrink-0" />
                      <span className="truncate">{chat.title}</span>
                    </div>
                    <button 
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {!isAddingTopic ? (
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsAddingTopic(true)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors text-sm"
                  >
                    <Plus size={16} />
                    Add Topic
                  </button>
                  <button 
                    onClick={() => directFileInputRef.current?.click()}
                    disabled={isExtracting}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors text-sm disabled:opacity-50"
                  >
                    {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Upload Files
                  </button>
                  <input 
                    type="file" 
                    ref={directFileInputRef}
                    onChange={handleDirectFileUpload}
                    multiple
                    accept="image/*,.txt,.md,.csv,application/pdf"
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="bg-gray-800 p-3 rounded-lg space-y-3">
                  <input 
                    type="text"
                    placeholder="Topic Title"
                    value={newTopicTitle}
                    onChange={e => setNewTopicTitle(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm outline-none focus:border-blue-500"
                  />
                  <div className="relative">
                    <textarea 
                      placeholder="Topic Content..."
                      value={newTopicContent}
                      onChange={e => setNewTopicContent(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm outline-none focus:border-blue-500 h-32 resize-none pb-10"
                    />
                    <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        multiple
                        accept="image/*,.txt,.md,.csv,application/pdf"
                        className="hidden"
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isExtracting}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                        title="Upload text files, PDFs, or images to extract knowledge"
                      >
                        {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {isExtracting ? 'Extracting...' : 'Upload File/Image'}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={addTopic}
                      disabled={isExtracting}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 py-1.5 rounded text-sm transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button 
                      onClick={() => setIsAddingTopic(false)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 py-1.5 rounded text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-2">
                {topics.map(topic => (
                  <div key={topic.id} className="bg-gray-800/50 p-3 rounded-lg group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 font-medium text-sm text-blue-400">
                        <BookOpen size={14} />
                        {topic.title}
                      </div>
                      <button 
                        onClick={() => deleteTopic(topic.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{topic.content}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-800 space-y-2">
          {userRole === 'admin' && (
            <button 
              onClick={onOpenSettings}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors text-sm text-gray-300"
            >
              <Settings size={16} />
              Settings
            </button>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 truncate">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                  {user?.email?.[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm truncate text-gray-300">{user?.displayName || user?.email}</span>
            </div>
            <button onClick={logOut} className="text-gray-500 hover:text-white transition-colors" title="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
