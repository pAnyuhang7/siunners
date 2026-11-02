import { cpSync, rmSync } from 'node:fs';

rmSync('dist-electron', { recursive: true, force: true });
cpSync('src/main', 'dist-electron', { recursive: true });
