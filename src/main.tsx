import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unzip } from 'unzipit';
import React, { useState, useEffect, useCallback } from 'react';

// Set initial theme based on system preference
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

interface FileEntry {
  path: string;
  entry: any;
}

function App() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [content, setContent] = useState<string>('');

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.toggle('dark');
  }, []);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    console.log(`Uploaded file size: ${(file.size / 1024).toFixed(2)} KB`);
    const { entries } = await unzip(file);

    const fileList: FileEntry[] = [];
    for (const [path, entry] of Object.entries(entries)) {
      if (!entry.isDirectory) {
        fileList.push({ path, entry });
      }
    }
    setFiles(fileList);
    setContent('');
  }, []);

  const handleFileClick = useCallback(async (fileEntry: FileEntry) => {
    const uint8 = await fileEntry.entry.arrayBuffer();
    const data = new Uint8Array(uint8);
    if (isBinary(data)) {
      setContent(`Binary file: ${fileEntry.path}`);
    } else {
      setContent(new TextDecoder().decode(data));
    }
  }, []);

  return (
    <>
      <div className="w-64 border-r border-gray-200 dark:border-gray-700 p-2 overflow-y-auto">
        {files.map((fileEntry) => (
          <button
            key={fileEntry.path}
            onClick={() => handleFileClick(fileEntry)}
            className="block w-full text-left px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            {fileEntry.path}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <input
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            className="text-sm"
          />
          <button
            onClick={toggleTheme}
            className="px-2 py-1 border rounded"
          >
            Toggle
          </button>
        </div>
        <pre className="p-4 flex-1 overflow-auto whitespace-pre-wrap">
          {content}
        </pre>
      </div>
    </>
  );
}

function isBinary(data: Uint8Array): boolean {
  const len = Math.min(data.length, 1000);
  for (let i = 0; i < len; i++) {
    const byte = data[i];
    if (byte === 0 || (byte < 7 || (byte > 13 && byte < 32))) {
      return true;
    }
  }
  return false;
}

const app = document.getElementById('app')!;
const root = createRoot(app);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
