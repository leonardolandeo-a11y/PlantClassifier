import { cp, mkdir, rm, readFile } from 'node:fs/promises';
const source = new URL('../frontend/dist/', import.meta.url);
const destination = new URL('../target/generated-resources/frontend/static/', import.meta.url);
const html = await readFile(new URL('index.html', source), 'utf8');
if (!html.includes('/assets/') || !html.includes('id="root"')) throw new Error('Build Vite before syncing assets');
// Only generated files are replaced. Source files and unrelated Maven output are untouched.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
