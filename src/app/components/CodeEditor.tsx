import React, { useState, useEffect } from 'react';

interface CodeEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  language?: string;
  height?: string;
  theme?: string;
  readOnly?: boolean;
}

export default function CodeEditor({
  code,
  onChange,
  language = 'javascript',
  height = '400px',
  theme = 'vs-dark',
  readOnly = false,
}: CodeEditorProps) {
  const [editorCode, setEditorCode] = useState(code);
  const [isDark, setIsDark] = useState(theme === 'vs-dark');

  useEffect(() => {
    setEditorCode(code);
  }, [code]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setEditorCode(newValue);
    onChange(newValue);
  };

  const getLanguageFromString = (lang: string) => {
    const languageMap: { [key: string]: string } = {
      'javascript': 'JavaScript',
      'python': 'Python',
      'java': 'Java',
      'cpp': 'C++',
      'c': 'C'
    };
    return languageMap[lang] || 'Code';
  };

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const insertTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      const newValue = editorCode.substring(0, start) + '  ' + editorCode.substring(end);
      setEditorCode(newValue);
      onChange(newValue);
      
      // Set cursor position after the inserted tab
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const themeClasses = isDark 
    ? 'bg-gray-900 text-green-400 border-gray-700' 
    : 'bg-white text-gray-900 border-gray-300';

  const lineNumbers = editorCode.split('\n').map((_, index) => index + 1);

  return (
    <div className={`border rounded-lg overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-300'}`} style={{ height }}>
      {/* Header */}
      <div className={`flex justify-between items-center px-4 py-2 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center space-x-2">
          <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            {getLanguageFromString(language)}
          </span>
          {readOnly && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Read Only
            </span>
          )}
        </div>
        <button
          onClick={toggleTheme}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            isDark 
              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* Editor Area */}
      <div className={`flex ${themeClasses}`} style={{ height: 'calc(100% - 49px)' }}>
        {/* Line Numbers */}
        <div className={`flex-shrink-0 px-3 py-3 text-right select-none ${
          isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-50 text-gray-400'
        } border-r ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          {lineNumbers.map(num => (
            <div key={num} className="leading-6 text-sm font-mono">
              {num}
            </div>
          ))}
        </div>

        {/* Code Input */}
        <div className="flex-1 relative">
          <textarea
            value={editorCode}
            onChange={handleCodeChange}
            onKeyDown={insertTab}
            readOnly={readOnly}
            className={`w-full h-full p-3 font-mono text-sm leading-6 resize-none outline-none ${themeClasses} ${
              readOnly ? 'cursor-default' : 'cursor-text'
            }`}
            style={{ 
              backgroundColor: 'transparent',
              color: isDark ? '#10b981' : '#1f2937',
              tabSize: 2
            }}
            placeholder={readOnly ? '' : `Write your ${getLanguageFromString(language)} code here...`}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Footer */}
      <div className={`px-4 py-2 border-t text-xs ${
        isDark 
          ? 'bg-gray-800 border-gray-700 text-gray-400' 
          : 'bg-gray-50 border-gray-200 text-gray-500'
      }`}>
        <div className="flex justify-between">
          <span>Lines: {lineNumbers.length} | Characters: {editorCode.length}</span>
          <span>Press Tab for indentation</span>
        </div>
      </div>
    </div>
  );
}