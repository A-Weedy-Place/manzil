import { config } from 'dotenv';
import { agentConfig, GeminiClient, type AgentImage } from '../server/gemini.js';
import { collectPublicPosts } from '../server/source.js';
import { downloadPublicImage } from '../server/source-media.js';

config({ path: '.env.gemini.local' });
const settings = agentConfig();
if (!settings.apiKey) throw new Error('Save GEMINI_API_KEY in ignored .env.gemini.local first; never paste it into chat.');
const source = await collectPublicPosts();
const post = source.posts.find(item => item.mediaUrls.length) ?? source.posts[0];
if (!post) throw new Error(`No usable public notice: ${source.state}. Run source:probe for diagnostics.`);
const images: AgentImage[] = [];
for (const url of post.mediaUrls.slice(0, 1)) {
  const image = await downloadPublicImage(url);
  if (image.ok && image.bytes.length <= 3_000_000) images.push({ mimeType: image.mimeType, bytes: image.bytes,
    kind: new URL(url).pathname.startsWith('/media/') ? 'photo' : 'video_thumbnail' });
}
const result = await new GeminiClient(settings).extract({ notice: { ...post, id: `probe-${post.sourceId}`, source: 'x',
  revision: 1, receivedAt: new Date().toISOString(), status: 'pending_agent', contentHash: 'read-only-probe' }, images, incidents: [] });
console.log(JSON.stringify({ model: settings.model, sourceId: post.sourceId, imagesSent: images.length,
  ...result, applicationDataWritten: false, modelCalled: true }, null, 2));
