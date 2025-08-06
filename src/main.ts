import './style.css';
import { unzip } from 'unzipit';

// Set initial theme based on system preference
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

const app = document.getElementById('app')!;
app.innerHTML = `
  <div id="sidebar" class="w-64 border-r border-gray-200 dark:border-gray-700 p-2 overflow-y-auto"></div>
  <div class="flex-1 flex flex-col">
    <div class="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <input id="fileInput" type="file" accept=".zip" class="text-sm" />
      <button id="themeToggle" class="px-2 py-1 border rounded">Toggle</button>
    </div>
    <pre id="content" class="p-4 flex-1 overflow-auto whitespace-pre-wrap"></pre>
  </div>
`;

const sidebar = document.getElementById('sidebar')!;
const content = document.getElementById('content')! as HTMLPreElement;
const fileInput = document.getElementById('fileInput')! as HTMLInputElement;
const themeToggle = document.getElementById('themeToggle')! as HTMLButtonElement;

themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  console.log(`Uploaded file size: ${(file.size / 1024).toFixed(2)} KB`);
  const { entries } = await unzip(file);

  sidebar.innerHTML = '';
  for (const [path, entry] of Object.entries(entries)) {
    if (entry.isDirectory) continue;
    const btn = document.createElement('button');
    btn.textContent = path;
    btn.className = 'block w-full text-left px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded';
    btn.addEventListener('click', async () => {
      const uint8 = await entry.arrayBuffer();
      const data = new Uint8Array(uint8);
      if (isBinary(data)) {
        content.textContent = `Binary file: ${path}`;
      } else {
        content.textContent = new TextDecoder().decode(data);
      }
    });
    sidebar.appendChild(btn);
  }
});

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
