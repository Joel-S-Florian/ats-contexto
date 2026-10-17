import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export interface BlobStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

/** Adaptador de desarrollo/pruebas: disco local. El adaptador S3/MinIO (bucket privado) se agrega al desplegar. */
export function localBlobStore(root: string): BlobStore {
  const base = resolve(root);
  const pathOf = (key: string) => {
    const p = resolve(join(base, key));
    if (!p.startsWith(base + sep)) throw new Error("Clave de archivo invalida");
    return p;
  };
  return {
    async put(key, data) {
      const p = pathOf(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, data);
    },
    get: (key) => readFile(pathOf(key)),
  };
}
