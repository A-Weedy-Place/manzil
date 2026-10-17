import { useEffect, useState } from 'react';

/** Decorative, code-native scenery only: no maps, location services or animation loop. */
export default function EntryDoodles({ paused }: { paused: boolean }) {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return <div className="entry-doodles" aria-hidden="true" data-paused={paused || hidden}>
    <svg className="entry-doodle entry-doodle-left" viewBox="0 0 320 660" fill="none" focusable="false">
      <path className="entry-doodle-road" d="M31 650V543q0-21 21-21h119q21 0 21-21V370q0-21-21-21H88q-21 0-21-21V188q0-21 21-21h101q21 0 21-21V10" />
      <path className="entry-doodle-trace entry-doodle-trace-left" pathLength="1" d="M31 650V543q0-21 21-21h119q21 0 21-21V370q0-21-21-21H88q-21 0-21-21V188q0-21 21-21h101q21 0 21-21V10" />
      <path className="entry-doodle-road" d="M6 247h124m-12 102v67m74 71h96M63 68h73v47H63z" />
      <circle className="entry-doodle-road" cx="31" cy="609" r="6" />
      <g className="entry-doodle-landmark" transform="translate(90 194)">
        <path d="M0 14 20 2l22 10L61 0v43L42 55 20 45 0 57Zm20-12v43m22-33v43" />
        <path d="M23 20q0-9 8-9t8 9q0 8-8 16-8-8-8-16Z" />
        <circle cx="31" cy="19" r="2" />
      </g>
      <g className="entry-doodle-car" transform="translate(55 422)">
        <path d="M0 21h57v18H0Zm8 0 9-15h23l10 15M18 8l-4 13m22-13 6 13" />
        <circle cx="13" cy="40" r="6" /><circle cx="45" cy="40" r="6" />
        <path className="entry-doodle-smoke" d="M-8 31h-14m12 8h-23m12-17h-12" />
      </g>
      <g className="entry-doodle-landmark" transform="translate(238 548)">
        <path d="M0 27 19 0l19 27Zm19 0v25m-8 0h16M19 9v8m0 5v1" />
      </g>
    </svg>

    <svg className="entry-doodle entry-doodle-right" viewBox="0 0 320 660" fill="none" focusable="false">
      <path className="entry-doodle-road" d="M291 7v129q0 21-21 21H137q-21 0-21 21v136q0 21 21 21h97q21 0 21 21v98q0 21-21 21h-93q-21 0-21 21v160" />
      <path className="entry-doodle-trace entry-doodle-trace-right" pathLength="1" d="M291 7v129q0 21-21 21H137q-21 0-21 21v136q0 21 21 21h97q21 0 21 21v98q0 21-21 21h-93q-21 0-21 21v160" />
      <path className="entry-doodle-road" d="M28 264h88m139 138h58M163 27h73v47h-73zm-5 539h69v47h-69z" />
      <g className="entry-doodle-bus" transform="translate(157 195)">
        <rect x="0" y="0" width="71" height="36" rx="7" />
        <path d="M0 22h71M12 7v9h13V7Zm22 0v9h13V7Zm22 0v9h9V7ZM8 32h4m48 0h4" />
        <circle cx="15" cy="38" r="6" /><circle cx="55" cy="38" r="6" />
      </g>
      <g className="entry-doodle-landmark" transform="translate(204 507)">
        <path d="m15 0 16 7 6 16-6 16-16 7L0 39l-7-16L0 7Zm-5 23h11m-6 23v24m-9 0h18" />
      </g>
      <g className="entry-doodle-walker" transform="translate(210 379)">
        <circle cx="21" cy="6" r="6" />
        <path d="m20 17-6 20 12 14 5 19m-17-33L3 56m13-28L0 35m19-15 12 13 11 3" />
      </g>
    </svg>

    <svg className="entry-doodle entry-doodle-top" viewBox="0 0 480 100" fill="none" focusable="false">
      <path className="entry-doodle-road" d="M10 76h111q16 0 16-16V29q0-16 16-16h172q16 0 16 16v24q0 16 16 16h113" />
      <circle className="entry-doodle-landmark" cx="14" cy="76" r="7" />
      <path className="entry-doodle-landmark" d="M459 50q0-11 11-11t11 11q0 10-11 22-11-12-11-22Zm7 0h8" />
      <g className="entry-doodle-closure" transform="translate(224 38)">
        <path d="M0 0h45v13H0Zm5 13v18m35-18v18M5 0l13 13M22 0l13 13" />
      </g>
    </svg>
  </div>;
}
