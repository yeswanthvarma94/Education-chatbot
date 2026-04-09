import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { ModelProvider } from '../services/aiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<ModelProvider>('gemini');
  const [modelName, setModelName] = useState('gemini-3-flash-preview');
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    anthropic: '',
    azure: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      const loadSettings = async () => {
        try {
          const userRef = doc(db, 'users', auth.currentUser!.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.selectedModel) {
              const [prov, ...rest] = data.selectedModel.split(':');
              setProvider(prov as ModelProvider);
              setModelName(rest.join(':'));
            }
            if (data.apiKeys) {
              setApiKeys(prev => ({ ...prev, ...data.apiKeys }));
            }
          }
        } catch (error) {
          console.error("Failed to load settings", error);
        }
      };
      loadSettings();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        selectedModel: `${provider}:${modelName}`,
        apiKeys
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">AI Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
            <select 
              value={provider}
              onChange={(e) => setProvider(e.target.value as ModelProvider)}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="azure">Azure OpenAI</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
            <input 
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g., gemini-3-flash-preview, gpt-4o"
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {provider === 'openai' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
              <input 
                type="password"
                value={apiKeys.openai}
                onChange={(e) => setApiKeys({...apiKeys, openai: e.target.value})}
                placeholder="sk-..."
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          {provider === 'anthropic' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anthropic API Key</label>
              <input 
                type="password"
                value={apiKeys.anthropic}
                onChange={(e) => setApiKeys({...apiKeys, anthropic: e.target.value})}
                placeholder="sk-ant-..."
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}
          
          {provider === 'azure' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Azure API Key</label>
              <input 
                type="password"
                value={apiKeys.azure}
                onChange={(e) => setApiKeys({...apiKeys, azure: e.target.value})}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Azure also requires endpoint config, which would be added here.</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
