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
import type { FuelService } from './fuel.js';
import type { AgentService } from './agent.js';
import { authenticateToken } from './community.js';

export function mountWorker(app: Express, config: RuntimeConfig, store: Repository, source: SourceService, fuel: FuelService, agent: AgentService) {
  app.get('/healthz', (_request, response) => response.json({ ok: true }));
  app.post('/internal/tick', async (request, response) => {
    if (config.mode === 'local' || config.role !== 'worker') throw new HttpError(404, 'Worker is unavailable on this service.');
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new HttpError(401, 'Worker identity is required.');
    let manual = false;
    if (config.mode === 'production') {
      try {
        const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience: config.workerAudience });
        const payload = ticket.getPayload();
        if (!payload?.email_verified || !payload.email || ![config.workerEmail, config.workerManualEmail].includes(payload.email)) throw new Error();
        manual = payload.email === config.workerManualEmail;
      } catch { throw new HttpError(403, 'Worker identity could not be verified.'); }
    } else {
      // Emulator-only admin token, verified against the local Auth emulator.
      const payload = await authenticateToken(firebaseServices(config.projectId).auth, token);
      if (payload.admin !== true) throw new HttpError(403, 'Emulator admin identity is required.');
    }
    const { job } = z.object({ job: z.enum(['source', 'commutes', 'fuel', 'agent']) }).strict().parse(request.body);
    if (manual && job !== 'agent') throw new HttpError(403, 'The API identity may invoke only the analysis job.');
    if (config.workerJobs && !config.workerJobs.includes(job)) throw new HttpError(403, 'This job is not enabled on this worker.');
    if (job === 'source') {
      const executed = await source.due();
      response.json({ executed, status: executed ? await source.check() : await store.sourceStatus() }); return;
    }
    if (job === 'fuel') { response.json({ status: await fuel.check() }); return; }
    if (job === 'agent') { response.json(await agent.run()); return; }
    // Existing local launchers already send this job; the persisted day claim
    // coalesces it with the dedicated daily fuel job. Tests never auto-fetch externals.
    if (process.env.NODE_ENV !== 'test') await fuel.check();
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
