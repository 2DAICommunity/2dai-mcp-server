import { realpath, stat, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import type { Config } from './config.js';

/** Filesystem boundary for agent-driven reads/writes. An agent following a
 *  prompt-injected instruction must not be able to exfiltrate ~/.ssh/id_rsa
 *  through upload_image, nor scribble outside the project through
 *  download_creation — so paths resolve against the CWD and must stay inside
 *  it unless TWODAI_FILE_ACCESS=any. Symlinks are resolved (realpath) BEFORE
 *  the boundary check, so a link pointing out of the sandbox fails the same
 *  way a ../ traversal does. With TWODAI_FILE_ACCESS=none (the hosted
 *  transport's default) there is no filesystem for the caller at all: the
 *  disk would be the server's own container. */

export class PathBoundaryError extends Error {}

/** Client-side pre-check ceiling. Matches the HIGHEST tier's server cap
 *  (Founder = 100 MB) so a Founder account isn't refused locally by this
 *  guard before its file even reaches the server. Accounts on lower tiers
 *  still get a proper 413 FILE_TOO_LARGE from the server (`/creation/upload`
 *  in the API), which the MCP surfaces back to the agent. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

async function assertInsideCwd(realPath: string, kind: 'read' | 'write'): Promise<void> {
  const cwd = await realpath(process.cwd());
  if (realPath !== cwd && !realPath.startsWith(cwd + sep)) {
    throw new PathBoundaryError(
      `Refusing to ${kind} outside the working directory (${cwd}). ` +
      `Set TWODAI_FILE_ACCESS=any in the server env to allow it.`,
    );
  }
}

function assertFileAccess(config: Config, kind: 'read' | 'write'): void {
  if (config.fileAccess !== 'none') return;
  throw new PathBoundaryError(
    kind === 'read'
      ? 'This server runs without filesystem access (hosted mode): send the file as "base64" instead of a "path".'
      : 'This server runs without filesystem access (hosted mode): omit "savePath" — the reply carries an inline preview and a "downloadUrl" to fetch the full file yourself.',
  );
}

/** Validate a file the agent wants to READ (upload source). Returns the
 *  resolved real path. Enforces existence, the CWD boundary and the upload
 *  size cap before a single byte is read. */
export async function resolveReadPath(userPath: string, config: Config): Promise<string> {
  assertFileAccess(config, 'read');
  const abs = isAbsolute(userPath) ? userPath : resolve(process.cwd(), userPath);
  let real: string;
  try {
    real = await realpath(abs);
  } catch {
    throw new PathBoundaryError(`File not found: ${abs}`);
  }
  const info = await stat(real);
  if (!info.isFile()) throw new PathBoundaryError(`Not a file: ${abs}`);
  if (info.size > MAX_UPLOAD_BYTES) {
    throw new PathBoundaryError(
      `File is ${(info.size / 1024 / 1024).toFixed(1)} MB — the upload cap is 100 MB (Founder tier); lower tiers cap earlier.`,
    );
  }
  if (config.fileAccess === 'cwd') await assertInsideCwd(real, 'read');
  return real;
}

/** Validate a path the agent wants to WRITE (download target). The file may
 *  not exist yet, so the boundary check runs on the nearest EXISTING ancestor
 *  directory's real path; missing directories inside the sandbox are created. */
export async function resolveWritePath(userPath: string, config: Config): Promise<string> {
  assertFileAccess(config, 'write');
  const abs = isAbsolute(userPath) ? userPath : resolve(process.cwd(), userPath);
  const dir = dirname(abs);
  let existing = dir;
  for (;;) {
    try {
      await stat(existing);
      break;
    } catch {
      const parent = dirname(existing);
      if (parent === existing) break;
      existing = parent;
    }
  }
  const realExisting = await realpath(existing);
  const tail = abs.slice(existing.length);
  const realTarget = realExisting + tail;
  if (config.fileAccess === 'cwd') await assertInsideCwd(realTarget, 'write');
  await mkdir(dirname(realTarget), { recursive: true });
  return realTarget;
}
