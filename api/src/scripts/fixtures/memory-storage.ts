import type { Storage } from "@/core/storage";

export type MemoryStorage = Storage & {
  files: Map<string, Buffer>;
  puts: string[];
};

export function createMemoryStorage(): MemoryStorage {
  const files = new Map<string, Buffer>();
  const puts: string[] = [];

  return {
    files,
    puts,

    async ensureBucket() {},

    async put(key, body) {
      files.set(key, body);
      puts.push(key);
    },

    async get(key) {
      const body = files.get(key);

      if (!body) {
        throw new Error(`Objeto não encontrado: ${key}`);
      }

      return body;
    },

    async remove(key) {
      files.delete(key);
    },

    async signedUrl(key) {
      return `memory://${key}`;
    },
  };
}
