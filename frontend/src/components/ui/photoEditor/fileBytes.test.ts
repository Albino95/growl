import { describe, expect, it, vi } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  readFileBytes,
  writeJpegBytes,
  type FileBytesEnv,
} from './fileBytes';

const SAMPLE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 250, 251, 252]);

function env(over: Partial<FileBytesEnv> = {}): FileBytesEnv {
  return {
    isWeb: false,
    fetchImpl: vi.fn(async () => {
      throw new Error('fetch must not be used on native');
    }),
    loadFs: vi.fn(async () => {
      throw new Error('no new fs');
    }),
    loadLegacyFs: vi.fn(async () => {
      throw new Error('no legacy fs');
    }),
    ...over,
  };
}

describe('base64 helpers', () => {
  it('round-trips every remainder length and matches Buffer', () => {
    for (let len = 0; len < 40; len++) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 37 + len) & 255);
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
    }
  });

  it('round-trips a large buffer (chunk boundaries)', () => {
    const bytes = new Uint8Array(3 * 4096 * 2 + 5).map((_, i) => (i * 131) & 255);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('ignores whitespace / newlines in base64 input', () => {
    const b64 = Buffer.from(SAMPLE).toString('base64');
    const wrapped = `${b64.slice(0, 4)}\n${b64.slice(4)}`;
    expect(Array.from(base64ToBytes(wrapped))).toEqual(Array.from(SAMPLE));
  });
});

describe('readFileBytes', () => {
  it('decodes data: URLs without touching fetch or the file system', async () => {
    const e = env();
    const uri = `data:image/jpeg;base64,${Buffer.from(SAMPLE).toString('base64')}`;
    expect(Array.from(await readFileBytes(uri, e))).toEqual(Array.from(SAMPLE));
    expect(e.fetchImpl).not.toHaveBeenCalled();
    expect(e.loadFs).not.toHaveBeenCalled();
  });

  it('web: uses fetch().arrayBuffer()', async () => {
    const fetchImpl = vi.fn(async () => ({ arrayBuffer: async () => SAMPLE.slice().buffer }));
    const e = env({ isWeb: true, fetchImpl });
    const out = await readFileBytes('blob:http://localhost/abc', e);
    expect(Array.from(out)).toEqual(Array.from(SAMPLE));
    expect(fetchImpl).toHaveBeenCalledWith('blob:http://localhost/abc');
    expect(e.loadFs).not.toHaveBeenCalled();
  });

  it('native: reads with expo-file-system File.bytes(), never fetch', async () => {
    const seen: string[] = [];
    class File {
      uri: string;
      constructor(uri: string) {
        this.uri = uri;
        seen.push(uri);
      }
      async bytes() {
        return SAMPLE;
      }
      write() {}
    }
    const e = env({ loadFs: async () => ({ File, Paths: { cache: { uri: 'file:///c/' } } }) as never });
    const out = await readFileBytes('file:///cache/ImageManipulator/a.jpg', e);
    expect(out).toBe(SAMPLE);
    expect(seen).toEqual(['file:///cache/ImageManipulator/a.jpg']);
    expect(e.fetchImpl).not.toHaveBeenCalled();
  });

  it('native: falls back to legacy base64 read when File.bytes() fails', async () => {
    const readAsStringAsync = vi.fn(async () => Buffer.from(SAMPLE).toString('base64'));
    const e = env({
      loadLegacyFs: async () =>
        ({
          cacheDirectory: 'file:///cache/',
          documentDirectory: null,
          EncodingType: { Base64: 'base64' },
          readAsStringAsync,
          writeAsStringAsync: vi.fn(),
        }) as never,
    });
    const out = await readFileBytes('file:///x.jpg', e);
    expect(Array.from(out)).toEqual(Array.from(SAMPLE));
    expect(readAsStringAsync).toHaveBeenCalledWith('file:///x.jpg', { encoding: 'base64' });
  });

  it('native: throws a readable error when every reader fails', async () => {
    await expect(readFileBytes('file:///x.jpg', env())).rejects.toThrow(/Could not read photo \(no new fs\)/);
  });
});

describe('writeJpegBytes', () => {
  it('web: returns a data URL', async () => {
    const out = await writeJpegBytes(SAMPLE, env({ isWeb: true }));
    expect(out).toBe(`data:image/jpeg;base64,${Buffer.from(SAMPLE).toString('base64')}`);
  });

  it('native: writes raw bytes with File.write into the cache dir', async () => {
    const writes: { uri: string; content: unknown }[] = [];
    class File {
      uri: string;
      constructor(dir: { uri: string }, name: string) {
        this.uri = `${dir.uri}${name}`;
      }
      async bytes() {
        return new Uint8Array();
      }
      write(content: unknown) {
        writes.push({ uri: this.uri, content });
      }
    }
    const out = await writeJpegBytes(
      SAMPLE,
      env({ loadFs: async () => ({ File, Paths: { cache: { uri: 'file:///cache/' } } }) as never })
    );
    expect(out).toMatch(/^file:\/\/\/cache\/grow-edit-.*\.jpg$/);
    expect(writes).toHaveLength(1);
    expect(writes[0].content).toBe(SAMPLE);
  });

  it('native: falls back to legacy base64 write', async () => {
    const writeAsStringAsync = vi.fn(async () => undefined);
    const out = await writeJpegBytes(
      SAMPLE,
      env({
        loadLegacyFs: async () =>
          ({
            cacheDirectory: 'file:///cache/',
            documentDirectory: null,
            EncodingType: { Base64: 'base64' },
            readAsStringAsync: vi.fn(),
            writeAsStringAsync,
          }) as never,
      })
    );
    expect(out).toMatch(/^file:\/\/\/cache\/grow-edit-/);
    expect(writeAsStringAsync).toHaveBeenCalledWith(out, Buffer.from(SAMPLE).toString('base64'), {
      encoding: 'base64',
    });
  });
});
