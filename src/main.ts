import './style.css';
import JSZip from 'jszip';

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
  const data = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(data);

  sidebar.innerHTML = '';
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const btn = document.createElement('button');
    btn.textContent = path;
    btn.className = 'block w-full text-left px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded';
    btn.addEventListener('click', async () => {
      const uint8 = await entry.async('uint8array');
      if (isBinary(uint8)) {
        content.textContent = `Binary file: ${path}`;
      } else {
        content.textContent = new TextDecoder().decode(uint8);
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
