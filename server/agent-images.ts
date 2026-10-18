import { createHash } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import type { Repository } from './repository.js';
import type { SourceNotice } from '../shared/types.js';
import type { AgentImage } from './gemini.js';
import { mediaMetaKey, type MediaArchiveRecord } from './source-archive.js';

export type AgentImageReader = (notice: SourceNotice) => Promise<AgentImage[]>;
/** Read only our archived, hashed private raster evidence; never fetch model-supplied URLs. */
export function cloudAgentImages(store: Repository, projectId: string, bucket: string): AgentImageReader {
  const storage = new Storage({ projectId, retryOptions: { autoRetry: false } });
  return async notice => {
    const images: AgentImage[] = []; let total = 0;
    for (const url of notice.mediaUrls.slice(0, 2)) {
      const record = await store.meta<MediaArchiveRecord>(mediaMetaKey(url));
      if (!record || record.state !== 'saved' || record.bucket !== bucket || !record.object?.startsWith('source-media/') ||
        !Number.isSafeInteger(record.bytes) || !record.bytes || record.bytes < 0 || total + record.bytes > 3_000_000 ||
        !Number.isFinite(Date.parse(record.expiresAt ?? '')) || Date.parse(record.expiresAt!) <= Date.now() ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(record.mimeType ?? '')) continue;
      const stream = storage.bucket(bucket).file(record.object).createReadStream();
      const timer = setTimeout(() => stream.destroy(new Error('Evidence read timed out.')), 7000);
      const chunks: Buffer[] = []; let bytes = 0;
      try {
        for await (const chunk of stream) {
          bytes += chunk.length;
          if (bytes > record.bytes || total + bytes > 3_000_000) throw new Error('Evidence exceeds the limit.');
          chunks.push(Buffer.from(chunk));
        }
        const image = Buffer.concat(chunks);
        if (image.length !== record.bytes || createHash('sha256').update(image).digest('hex') !== record.sha256) continue;
        total += image.length;
        images.push({ bytes: image, mimeType: record.mimeType!, kind: record.kind });
      } catch { /* Keep text evidence and expose imageCount; never invent image contents. */ }
      finally { clearTimeout(timer); stream.destroy(); }
    }
    return images;
  };
}
