import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import type { Request, Response } from 'express';
import { HttpError } from '../errors.js';

const gzipAsync = promisify(gzip);

/** Only the public, finite transit network opts into compression. Dynamic
 * availability still uses no-store; this does not compress private responses. */
export async function sendTransitNetwork(request: Request, response: Response, network: unknown) {
  response.vary('Accept-Encoding');
  // Keep existing identity behavior for clients that do not negotiate encoding.
  const encoding = request.headers['accept-encoding'] ? request.acceptsEncodings('gzip', 'identity') : 'identity';
  if (!encoding) throw new HttpError(406, 'No supported transit response encoding is acceptable.');
  if (encoding !== 'gzip') { response.json(network); return; }

  const body = await gzipAsync(Buffer.from(JSON.stringify(network), 'utf8'), { level: 4 });
  if (response.destroyed || response.writableEnded) return;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Encoding', 'gzip');
  // Express computes Content-Length from the compressed Buffer, not the JSON.
  response.send(body);
}
