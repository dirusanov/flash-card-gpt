// Static article for manual Chrome CPU measurements; intentionally no page JavaScript.
// Open 20 URLs /?tab=1 through /?tab=20 in a separate, signed-out Chrome profile.
const http = require('node:http');
const port = Number(process.argv[2] || 8766);
const paragraphs = Array.from({ length: 300 }, (_, i) =>
  `<p>Paragraph ${i}. A simple article about learning vocabulary and building resilience. Read, select a word, and continue.</p>`
).join('');
http.createServer((request, response) => {
  const raw = new URL(request.url, 'http://localhost').searchParams.get('tab');
  const tab = /^\d+$/.test(raw || '') ? raw : '1';
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<!doctype html><html lang="en"><head><title>Vaulto CPU QA ${tab}</title>
    <style>body{font:18px sans-serif;margin:40px;max-width:1000px}p{line-height:1.8}</style>
    </head><body><h1>Vaulto CPU QA — static article</h1>
    <p>Resilience means recovering after difficult times. Learning a language takes practice.</p>
    <p>This page has no animation, polling or background requests. Select a word to test Vaulto.</p>
    ${paragraphs}</body></html>`);
}).listen(port, '127.0.0.1', () => console.log(`CPU fixture http://127.0.0.1:${port}/`));
