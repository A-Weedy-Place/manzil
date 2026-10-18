/** Bounded operator backfill of saved interpretations; no Gemini request or closure write. */
import { execFileSync } from 'node:child_process';
import { Firestore } from 'firebase-admin/firestore';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { FirestoreStore } from '../server/firestore-store.js';
import { AgentService } from '../server/agent.js';
import { agentConfig } from '../server/gemini.js';
import { agentResultKey, type AgentResult } from '../shared/agent.js';
import { prepareAgentProposals } from '../server/agent-proposals.js';

const projectId = 'manzil-app-v1';
async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Clear the emulator environment before cloud operator work.');
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Use no arguments for a preview, or --apply to save private proposals.');
  const apply = process.argv.includes('--apply');
  const token = execFileSync('cmd.exe', ['/d', '/s', '/c', `gcloud.cmd auth print-access-token --project=${projectId} --quiet`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const client = new OAuth2Client({ quotaProjectId: projectId });
  client.setCredentials({ access_token: token, expiry_date: Date.now() + 25 * 60_000 });
  const db = new Firestore({ projectId, preferRest: true, auth: new GoogleAuth({ authClient: client, projectId }) });
  try {
    const store = new FirestoreStore(db), service = new AgentService(store, agentConfig({}));
    const notices = await store.listNotices(100), snapshot = await store.routingSnapshot(true);
    const rows = [];
    for (const notice of notices) {
      if (rows.length >= 10) break;
      const result = await store.meta<AgentResult>(agentResultKey(notice.id));
      if (!result?.extraction || result.noticeRevision !== notice.revision || result.proposals || notice.status === 'dismissed' ||
        ['processing', 'failed', 'dismissed'].includes(result.state)) continue;
      const proposals = apply ? (await service.prepareNotice(notice.id, notice.revision)).proposals! :
        await prepareAgentProposals(notice, result.extraction, snapshot.closures);
      rows.push({ sourceId: notice.sourceId, revision: notice.revision, proposals: proposals.length,
        mapped: proposals.filter(proposal => proposal.mapping !== 'unresolved').length, withStart: proposals.filter(proposal => !!proposal.draft.startsAt).length });
    }
    if ((await store.routingSnapshot()).revision !== snapshot.revision) throw new Error('The routing revision changed concurrently; inspect the map independently.');
    console.log(JSON.stringify({ projectId, apply, modelCalled: false, closureWrites: 0, routingRevision: snapshot.revision, results: rows }));
  } finally { client.setCredentials({}); await db.terminate(); }
}
main().catch(() => { console.error('Proposal preparation failed. Existing source and map data were retained; inspect cloud access or retry after refreshing the source.'); process.exitCode = 1; });
