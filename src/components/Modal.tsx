import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
export default function Modal({ children, titleId, onClose, className = '', overlay, cardStyle, cardRef }: { children: ReactNode; titleId: string; onClose: () => void; className?: string; overlay?: ReactNode; cardStyle?: CSSProperties; cardRef?: RefObject<HTMLDivElement | null> }) {
  const box = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, a[href], [tabindex="0"]') ?? []).filter(item => item.getClientRects().length);
    (focusable()[0] ?? box.current)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); box.current?.focus(); }
        else if (event.shiftKey && (!box.current?.contains(document.activeElement) || document.activeElement === first)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (!box.current?.contains(document.activeElement) || document.activeElement === last)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, []);
  return createPortal(<div className={`modal-backdrop ${className}`}>{overlay}<div className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId} style={cardStyle} ref={element => { box.current = element; if (cardRef) cardRef.current = element; }} tabIndex={-1}>{children}</div></div>, document.body);
}
