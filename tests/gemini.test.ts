import { describe, expect, it, vi } from 'vitest';
import { agentConfig, GeminiClient, GeminiError } from '../server/gemini';
import { extraction, notice } from './agent-fixtures';
const config = () => ({ ...agentConfig({}), apiKey: 'private-test-key', enabled: true });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const answer = () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'not output' }, { text: JSON.stringify(extraction()) }] } }],
  usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 400, thoughtsTokenCount: 25 } });
describe('bounded Gemini structured client', () => {
  it('counts before generation, sends the key only in a header and parses strict structured output', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ totalTokens: 1800 })).mockResolvedValueOnce(json(answer()));
    const result = await new GeminiClient(config(), fetcher).extract({ notice: notice(), images: [{ bytes: Buffer.from('image'), mimeType: 'image/png', kind: 'video_thumbnail' }], incidents: [] });
    expect(result.usage).toEqual({ inputTokens: 1800, outputTokens: 425 }); expect(result.extraction.summaryUrdu).toBe(extraction().summaryUrdu);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(fetcher.mock.calls[0][0]).toContain(':countTokens'); expect(fetcher.mock.calls[1][0]).toContain(':generateContent');
    for (const [url, request] of fetcher.mock.calls) { expect(String(url)).not.toContain(config().apiKey); expect(request?.headers).toMatchObject({ 'x-goog-api-key': config().apiKey }); expect(request?.redirect).toBe('error'); }
    const body = JSON.parse(String(fetcher.mock.calls[1][1]?.body)); expect(body.generationConfig.maxOutputTokens).toBe(4096);
    expect(body.contents[0].parts[1].inlineData.data).toBe(Buffer.from('image').toString('base64'));
  });
  it.each([[402,'billing'],[429,'quota'],[403,'authentication'],[503,'unavailable']] as const)('stops on HTTP %s without another service or generation call', async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: { message: `Bad key ${config().apiKey}` } }, status));
    const error = await new GeminiClient(config(), fetcher).extract({ notice: notice(), images: [], incidents: [] }).catch(error => error);
    expect(error).toBeInstanceOf(GeminiError); expect(error.code).toBe(code); expect(error.detail).not.toContain(config().apiKey); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds chunked error bodies even without content-length', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('x'.repeat(9000), { status: 402 }));
    const error = await new GeminiClient(config(), fetcher).extract({ notice: notice(), images: [], incidents: [] }).catch(error => error);
    expect(error.code).toBe('billing'); expect(error.detail).toBeUndefined();
  });
  it('rejects excessive input without generation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ totalTokens: 20_001 }));
    await expect(new GeminiClient(config(), fetcher).extract({ notice: notice(), images: [], incidents: [] })).rejects.toMatchObject({ code: 'input_limit' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['truncated','invalid_schema','oversized'] as const)('withholds malformed output: %s', async kind => {
    const result = answer();
    if (kind === 'truncated') result.candidates[0].finishReason = 'MAX_TOKENS';
    if (kind === 'invalid_schema') result.candidates[0].content.parts = [{ text: '{"arbitraryTool":"delete_everything"}' }];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ totalTokens: 10 })).mockResolvedValueOnce(kind === 'oversized' ? new Response('x'.repeat(200_001)) : json(result));
    await expect(new GeminiClient(config(), fetcher).extract({ notice: notice(), images: [], incidents: [] })).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
