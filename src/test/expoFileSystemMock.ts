/**
 * Test double for expo-file-system's class API (File / Directory / Paths) backed by the real
 * filesystem under a temporary root, so atomic-write and recovery logic is tested on real files.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs') as typeof import('fs');
const os = require('os') as typeof import('os');
const nodePath = require('path') as typeof import('path');
const { fileURLToPath, pathToFileURL } = require('url') as typeof import('url');

const ROOT = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'poselens-test-'));

export const testFs = {
  root: ROOT,
  availableDiskSpace: 64 * 1024 * 1024 * 1024,
  reset(): void {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
    testFs.availableDiskSpace = 64 * 1024 * 1024 * 1024;
  },
};

type Part = string | File | Directory;

function resolve(parts: Part[]): string {
  const segments = parts.map((part) => {
    if (typeof part !== 'string') return part.path;
    return part.startsWith('file://') ? fileURLToPath(part) : part;
  });
  return nodePath.join(...segments);
}

export enum FileMode {
  ReadOnly = 'r',
}

export class Directory {
  readonly path: string;
  constructor(...parts: Part[]) {
    this.path = resolve(parts);
  }
  get uri(): string {
    return pathToFileURL(this.path).href;
  }
  get name(): string {
    return nodePath.basename(this.path);
  }
  get exists(): boolean {
    return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory();
  }
  create(options: { intermediates?: boolean; idempotent?: boolean } = {}): void {
    if (this.exists && options.idempotent) return;
    fs.mkdirSync(this.path, { recursive: !!options.intermediates });
  }
  list(): (File | Directory)[] {
    return fs.readdirSync(this.path).map((name) => {
      const full = nodePath.join(this.path, name);
      return fs.statSync(full).isDirectory() ? new Directory(full) : new File(full);
    });
  }
  delete(): void {
    fs.rmSync(this.path, { recursive: true, force: true });
  }
}

export class File {
  readonly path: string;
  constructor(...parts: Part[]) {
    this.path = resolve(parts);
  }
  get uri(): string {
    return pathToFileURL(this.path).href;
  }
  get name(): string {
    return nodePath.basename(this.path);
  }
  get exists(): boolean {
    return fs.existsSync(this.path) && fs.statSync(this.path).isFile();
  }
  get size(): number {
    return this.exists ? fs.statSync(this.path).size : 0;
  }
  get modificationTime(): number | null {
    return this.exists ? fs.statSync(this.path).mtimeMs : null;
  }
  create(options: { overwrite?: boolean } = {}): void {
    if (this.exists && !options.overwrite) throw new Error('File already exists');
    fs.mkdirSync(nodePath.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, '');
  }
  async write(content: string | Uint8Array): Promise<void> {
    fs.writeFileSync(this.path, content);
  }
  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(fs.readFileSync(this.path));
  }
  async move(destination: File | Directory): Promise<void> {
    const target = destination instanceof Directory ? nodePath.join(destination.path, this.name) : destination.path;
    fs.renameSync(this.path, target);
    (this as { path: string }).path = target;
  }
  delete(): void {
    fs.rmSync(this.path, { force: true });
  }
  open(): { readBytesSync: (length: number) => Uint8Array; close: () => void } {
    const fd = fs.openSync(this.path, 'r');
    return {
      readBytesSync: (length: number) => {
        const buffer = Buffer.alloc(length);
        const read = fs.readSync(fd, buffer, 0, length, 0);
        return new Uint8Array(buffer.subarray(0, read));
      },
      close: () => fs.closeSync(fd),
    };
  }
}

export class Paths {
  static get document(): Directory {
    return new Directory(ROOT, 'document');
  }
  static get cache(): Directory {
    return new Directory(ROOT, 'cache');
  }
  static get availableDiskSpace(): number {
    return testFs.availableDiskSpace;
  }
}
