import fs from 'fs';
import path from 'path';

/**
 * Lightweight, zero-dependency environment variable loader (.env)
 * Automatically populates process.env at server startup.
 */
export function loadEnv(filePath: string = '.env'): void {
  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return;

    const content = fs.readFileSync(resolved, 'utf-8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.warn('Notice loading .env file:', err);
  }
}

