import { GoogleAuth } from 'google-auth-library';
import { HttpError } from './errors.js';
/** Fixed configured private origin, workload identity, no model key or user token forwarding. */
export function createAgentDispatch(origin: string, auth = new GoogleAuth()) {
  let ready: ReturnType<GoogleAuth['getIdTokenClient']> | undefined;
  return async () => {
    try {
      const client = await (ready ??= auth.getIdTokenClient(origin).catch(error => { ready = undefined; throw error; }));
      const response = await client.request({ url: `${origin}/internal/tick`, method: 'POST', data: { job: 'agent' },
        timeout: 140_000, retry: false, maxContentLength: 80_000 });
      return response.data;
    } catch {
      throw new HttpError(503, 'The private analysis worker could not complete this request. Refresh activity before retrying; the scheduled job and daily limits still apply.');
    }
  };
}
