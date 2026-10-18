import '../entry-intersection.css';

/** Original outlined street vignette; no location, tiles or JavaScript animation. */
export default function EntryIntersection() {
  return <svg className="entry-doodle entry-doodle-right entry-intersection-scene" viewBox="0 0 260 620" fill="none" focusable="false">
    <g className="entry-intersection-road">
      <path className="entry-intersection-edge" pathLength="1" d="M128 32v210q0 18-18 18H8M180 32v210q0 18 18 18h54M8 324h102q18 0 18 18v245M252 324h-54q-18 0-18 18v245" />
      <path className="entry-intersection-centre" d="M154 32v210M154 345v67m0 49v126M8 292h99m94 0h51" />
      <path className="entry-intersection-crossing" d="M133 438h42m-42 8h42m-42 8h42m-42 8h42" />
      <path className="entry-intersection-curb" d="M119 37v164m70-164v164M119 482v90m70-90v90M15 250h74m116 0h39M15 334h74m116 0h39" />
    </g>
    <g className="entry-intersection-sign" transform="translate(50 182)">
      <path d="m0 9 9-9h18l9 9v18l-9 9H9l-9-9Z" /><path d="M18 36v37m-9 0h18" />
      <text x="18" y="22" textAnchor="middle">STOP</text>
    </g>
    <g className="entry-intersection-sign entry-intersection-directions" transform="translate(193 369)">
      <path d="M0 0h38l9 11-9 11H0ZM16 22v59m-8 0h16M8 11h27m-6-5 6 5-6 5M-4 34h35v20H-4Zm9 10h17m-12-5-5 5 5 5" />
    </g>
    <g className="entry-intersection-bus-position">
      <g className="entry-intersection-exhaust">
        <path className="entry-exhaust-wisp" d="M-3 39c-6-3-10 3-15 0s-9-3-12-1" />
        <path className="entry-exhaust-wisp is-trailing" d="M-11 35c-3-5-8-5-11-2s-8 2-11-1" />
      </g>
      <g className="entry-intersection-bus">
        <path d="M3 2h71q8 0 11 9l7 17v18H0V9q0-7 3-7Z" />
        <path d="M7 7h47v19H7Zm53 0h12q5 0 7 7l4 12H60ZM19 7v19M31 7v19M43 7v19M59 30h15v16H59Z" />
        <path d="M3 32h48m-45 5h45M65 33v8M0 41h6m77-7h8m-3 5h4m-5-19h10v7h-5M12-2h55m-49-4h42" />
        <circle cx="19" cy="46" r="8" /><circle cx="74" cy="46" r="8" /><circle className="entry-intersection-wheel" cx="19" cy="46" r="3" /><circle className="entry-intersection-wheel" cx="74" cy="46" r="3" />
        <path className="entry-intersection-bus-detail" d="m11 12 7 7m16-7 7 7m23-7 7 7M29 42h34" />
      </g>
    </g>
    <g className="entry-intersection-walker-position">
      <g className="entry-intersection-walker-bob">
        <g transform="translate(1 34)"><g className="entry-intersection-thigh entry-intersection-thigh-back"><path d="M-3 0h6v17h-6Z" /><g transform="translate(0 16)"><g className="entry-intersection-calf entry-intersection-calf-back"><path d="M-3 0h6v17h-6Z" /><path className="entry-intersection-shoe" d="M-3 16h6l6 3v3H-3Z" /></g></g></g></g>
        <g transform="translate(5 34)"><g className="entry-intersection-thigh entry-intersection-thigh-front"><path d="M-3 0h6v17h-6Z" /><g transform="translate(0 16)"><g className="entry-intersection-calf entry-intersection-calf-front"><path d="M-3 0h6v17h-6Z" /><path className="entry-intersection-shoe" d="M-3 16h6l6 3v3H-3Z" /></g></g></g></g>
        <g transform="translate(2 20)"><g className="entry-intersection-arm entry-intersection-arm-back"><path d="M-2 0h4v12l4 9-4 2-5-10Z" /></g></g>
        <path className="entry-intersection-shirt" d="M-2 16q6-3 12 1l1 20q-7 3-15-1l1-15Z" />
        <path d="M-4 19h-4q-4 0-4 5v9h8m-5-8h5M3 12v5m6-5v5" />
        <g transform="translate(7 20)"><g className="entry-intersection-arm entry-intersection-arm-front"><path d="M-2 0h4v12l4 9-4 2-5-10Z" /></g></g>
        <path d="M0 3q2-5 9-3l2 7 3 2-3 2-1 4H4l-4-5Z" /><path className="entry-intersection-hair" d="M0 8q-5-9 2-11 8-3 9 4L5 0 3 6Z" /><path className="entry-intersection-face" d="M9 6h.5m-4 6h4" />
      </g>
    </g>
    <g className="entry-intersection-flourish"><path d="M44 403q-9-15 0-24m-1 12q-10-3-12-12m13 6q11-4 12-13M214 131l7-8m-4 17h11M44 542h17m-8-8v16" /><circle cx="72" cy="99" r="3" /><circle cx="222" cy="549" r="3" /></g>
  </svg>;
}
