import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
export default function Modal({ children, titleId, onClose, className = '', overlay, cardStyle, cardRef, dismissOnOutsideClick = false }: { children: ReactNode; titleId: string; onClose: () => void; className?: string; overlay?: ReactNode; cardStyle?: CSSProperties; cardRef?: RefObject<HTMLDivElement | null>; dismissOnOutsideClick?: boolean }) {
  const box = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  const pointerGesture = useRef<{ startOutside: boolean; endOutside?: boolean } | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, a[href], [tabindex="0"]') ?? []).filter(item => item.getClientRects().length);
    (focusable()[0] ?? box.current)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Let an open combobox consume its first Escape before dismissing the dialog.
        if (event.target instanceof Element && box.current?.contains(event.target) && event.target.closest('[role="combobox"][aria-expanded="true"]')) return;
        event.preventDefault(); close.current();
      }
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
  return createPortal(<div className={`modal-backdrop ${className}`}
    onPointerDownCapture={event => {
      if (dismissOnOutsideClick) pointerGesture.current = { startOutside: event.button === 0 && !box.current?.contains(event.target as Node) };
    }}
    onPointerUpCapture={event => {
      if (pointerGesture.current) pointerGesture.current.endOutside = !box.current?.contains(event.target as Node);
    }}
    onPointerCancelCapture={() => { pointerGesture.current = { startOutside: false }; }}
    onClickCapture={event => {
      const gesture = pointerGesture.current; pointerGesture.current = null;
      if (!dismissOnOutsideClick || box.current?.contains(event.target as Node)) return;
      // Consume the backdrop click; closing must not activate a map or setting below it.
      event.preventDefault(); event.stopPropagation();
      // A selection or drag that starts/ends in the card is not an outside click.
      if (event.button === 0 && (!gesture || gesture.startOutside && gesture.endOutside !== false)) close.current();
    }}>
    {overlay}<div className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId} style={cardStyle} ref={element => { box.current = element; if (cardRef) cardRef.current = element; }} tabIndex={-1}>{children}</div></div>, document.body);
}
