import { rm } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const distPath = path.resolve(projectRoot, 'dist');

if (distPath === projectRoot || path.dirname(distPath) !== projectRoot || path.basename(distPath) !== 'dist') {
  throw new Error(`Refusing to clean unexpected build path: ${distPath}`);
}

await rm(distPath, { recursive: true, force: true });
