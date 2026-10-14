import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Serverless bundles are read-only outside the OS temp dir, so hosted runs keep
 * state there. Local runs keep it beside the project.
 */
export function stateFile(...parts: string[]) {
  const root = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join(os.tmpdir(), 'monblip')
    : process.cwd();
  return path.join(root, ...parts);
}

export async function writeState(file: string, contents: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents, { mode: 0o600 });
}
