import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentResult } from '../../shared/agent';
import type { SourceNotice } from '../../shared/types';
import { api } from './api';
import type { AgentStatus } from './pipeline';
export interface AgentPipelineState {
  status: AgentStatus | null; results: AgentResult[]; error: string; loading: boolean;
  refresh: () => Promise<void>; update: (result: AgentResult) => void;
}
/** Saved-state polling only. Model execution is always a separate explicit/scheduled action. */
export function useAgentPipeline(notices: SourceNotice[], active = true): AgentPipelineState {
  const [status,setStatus] = useState<AgentStatus | null>(null), [results,setResults] = useState<AgentResult[]>([]);
  const [error,setError] = useState(''), [loading,setLoading] = useState(active);
  const sequence = useRef(0), inFlight = useRef<Promise<void> | null>(null), live = useRef(active);
  const marker = notices.map(notice => `${notice.id}:${notice.revision}:${notice.status}`).join('|');
  live.current = active;
  const refresh = useCallback(() => {
    if (!live.current) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    const id = ++sequence.current;
    const task = (async () => {
      try {
        const [next,rows] = await Promise.all([api<AgentStatus>('/agent/status'),api<AgentResult[]>('/agent/results')]);
        if (!live.current || id !== sequence.current) return;
        setStatus(typeof next?.enabled === 'boolean' ? next : null); setResults(Array.isArray(rows) ? rows : []); setError('');
      } catch (reason) { if (live.current && id === sequence.current) setError(reason instanceof Error ? reason.message : 'Could not load Gemini status.'); }
      finally { if (live.current && id === sequence.current) setLoading(false); }
    })().finally(() => { if (inFlight.current === task) inFlight.current = null; });
    inFlight.current = task; return task;
  },[]);
  useEffect(() => {
    live.current = active; sequence.current++; inFlight.current = null;
    if (active) void refresh();
    return () => { live.current = false; sequence.current++; inFlight.current = null; };
  },[active,marker,refresh]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { if (!document.hidden) void refresh(); },status?.processing ? 4000 : 15000);
    return () => clearInterval(timer);
  },[active,status?.processing,refresh]);
  const update = useCallback((result: AgentResult) => { sequence.current++; inFlight.current = null;
    setResults(old => [...old.filter(item => item.noticeId !== result.noticeId),result]); },[]);
  return { status,results,error,loading,refresh,update };
}
