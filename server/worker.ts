import type { Express } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { RuntimeConfig } from './config.js';
import type { Repository } from './repository.js';
import type { SourceService } from './source.js';
import { firebaseServices } from './firebase.js';
import { checkEnabledCommutes } from './commutes.js';
import { HttpError } from './errors.js';

export function mountWorker(app: Express, config: RuntimeConfig, store: Repository, source: SourceService) {
  app.get('/healthz', (_request, response) => response.json({ ok: true }));
  app.post('/internal/tick', async (request, response) => {
    if (config.mode === 'local' || config.role !== 'worker') throw new HttpError(404, 'Worker is unavailable on this service.');
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new HttpError(401, 'Worker identity is required.');
    if (config.mode === 'production') {
      try {
        const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience: config.workerAudience });
        const payload = ticket.getPayload();
        if (!payload?.email_verified || payload.email !== config.workerEmail) throw new Error();
      } catch { throw new HttpError(403, 'Worker identity could not be verified.'); }
    } else {
      // Emulator-only admin token, verified against the local Auth emulator.
      const payload = await firebaseServices(config.projectId).auth.verifyIdToken(token);
      if (payload.admin !== true) throw new HttpError(403, 'Emulator admin identity is required.');
    }
    const { job } = z.object({ job: z.enum(['source', 'commutes']) }).strict().parse(request.body);
    if (job === 'source') { response.json({ status: await source.due() ? await source.check() : await store.sourceStatus() }); return; }
    const db = firebaseServices(config.projectId).db;
    const cursor = await store.meta<string>('sourceUserCheckCursor');
    let query = db.collection('users').orderBy(FieldPath.documentId()).limit(20);
    if (cursor) query = query.startAfter(cursor);
    const users = await query.get();
    for (const user of users.docs) { const personal = store.forUser(user.id); await personal.retainTrips(Date.now()); await checkEnabledCommutes(personal); }
    await store.setMeta('sourceUserCheckCursor', users.size === 20 ? users.docs.at(-1)!.id : '');
    response.json({ checkedUsers: users.size, more: users.size === 20 });
  });
}
