import { useEffect, useId, useState } from 'react';

// Schematic illustration including Pakistan's claimed Kashmir region, with the
// Survey of Pakistan's 2020 political map as reference (government reproduction:
// https://www.ppib.gov.pk/pakistan.html). Not boundary, search or routing data.
const pakistanOutline = 'M186 15 194 13 200 15 207 12 211 7 218 10 222 8 227 13 231 15 233 22 234 35 237 43 244 45 251 51 260 52 265 78 272 109 274 134 268 137 265 129 260 131 255 128 248 123 244 124 238 133 236 143 231 150 230 156 223 161 219 166 219 177 219 188 216 191 217 195 212 205 208 211 208 217 202 223 199 222 195 242 189 261 183 273 180 284 171 287 160 291 158 283 154 282 149 291 146 303 142 312 140 322 144 326 149 326 150 339 149 350 154 355 158 351 160 367 163 375 164 387 160 389 165 393 160 397 149 395 146 401 139 397 128 396 126 404 120 404 118 413 115 403 108 408 103 394 102 386 98 377 94 376 87 364 80 361 67 362 54 360 44 362 33 361 22 360 12 363 15 340 18 326 27 320 38 316 40 307 34 301 33 285 33 270 24 265 18 255 14 243 6 217 30 234 46 233 54 236 59 231 71 234 88 226 91 219 90 209 92 198 90 193 97 181 103 185 109 181 112 179 110 174 118 170 120 166 123 171 126 167 130 172 134 169 137 163 136 152 138 145 142 135 140 134 142 130 149 128 152 123 152 113 148 111 148 106 146 107 146 102 151 104 156 106 163 103 164 94 162 88 164 79 167 72 171 67 172 60 169 51 169 44 166 40 170 32 175 25 179 20Z';
const schematicRoads = [
  'M198 31 202 59 187 81 193 103 177 127 185 153 173 176 178 199 159 226 165 248 146 271 153 296 133 321 141 346 118 371 128 407',
  'M252 44 235 66 240 86 219 106 227 125 209 147 215 169 193 192 195 217 176 236 182 261 166 283 174 306',
  'M151 110 180 117 201 106 222 111 253 100 281 105',
  'M134 142 160 145 180 134 202 141 223 132 251 139',
  'M128 174 151 178 174 167 193 178 216 171 241 160',
  'M113 199 137 205 157 193 179 200 196 193 218 200',
  'M100 229 121 235 139 222 159 226 176 216 198 225',
  'M86 255 109 265 129 254 147 263 165 248 189 254',
  'M17 244 40 252 61 243 81 253 104 240',
  'M29 272 53 279 76 267 93 287',
  'M39 251 46 276 36 296 M64 245 72 269 60 293',
  'M68 279 93 287 115 274 133 284 151 276 177 281',
  'M29 305 56 306 75 296 98 309 118 296 141 305 172 308',
  'M22 336 46 331 70 340 95 328 114 337 134 322 162 334',
  'M16 364 45 359 65 372 88 355 108 363 125 350 147 360',
  'M25 391 51 384 74 391 91 378 111 386 137 384',
  'M174 59 194 68 215 55 237 65 267 61',
  'M190 81 215 82 232 95 257 83 279 85',
  'M146 129 158 157 148 179 151 205 135 230 140 252 120 275 125 301 108 327 111 351 90 378 93 397',
  'M118 201 122 225 109 243 114 264 94 286 100 307 82 332 88 355',
  'M61 290 68 314 56 335 64 357 51 385',
  'M211 31 218 52 209 76 219 106 206 124 210 146',
  'M256 54 258 76 243 92 253 113 240 131 244 153',
  'M164 149 154 157 162 165 149 174 M188 204 176 197 167 206 155 201',
  'M105 300 91 298 87 308 74 306 M124 340 135 348 128 359 137 366',
];

/** Code-native decorative scenery: no map requests, GPS or JavaScript animation loop. */
export default function EntryDoodles({ paused }: { paused: boolean }) {
  const [hidden, setHidden] = useState(() => document.hidden);
  const sceneId = useId().replace(/:/g, '');
  const borderClip = `entry-pakistan-${sceneId}`;
  const scanClip = `entry-scan-${sceneId}`;
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return <div className="entry-doodles" aria-hidden="true" data-paused={paused || hidden}>
    <svg className="entry-doodle entry-doodle-left entry-pakistan-scene" viewBox="0 0 300 330" fill="none" focusable="false">
      <defs>
        <clipPath id={borderClip}><path d={pakistanOutline} fill="#fff" /></clipPath>
        <clipPath id={scanClip} clipPathUnits="userSpaceOnUse"><rect className="entry-pakistan-reveal" x="0" y="0" width="300" height="450" fill="#fff" /></clipPath>
      </defs>
      <g transform="translate(0 20) scale(1 .65)"><g className="entry-pakistan-cycle">
        <path className="entry-pakistan-outline" d={pakistanOutline} pathLength="1" vectorEffect="non-scaling-stroke" />
        <g clipPath={`url(#${borderClip})`}>
          <g clipPath={`url(#${scanClip})`} className="entry-pakistan-roads">
            {schematicRoads.map((road, index) => <path key={index} d={road} />)}
            <path className="entry-pakistan-highway" d="m203 61-16 21 6 21-16 24 8 26-12 23 5 23-19 27 6 22-19 23 7 25-20 25 8 25-23 25 10 36" />
            {[[194, 103], [179, 200], [165, 248], [133, 321], [118, 371], [128, 407]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.8" />)}
          </g>
          <g className="entry-pakistan-scanner"><path d="M0 0h300" /><path className="entry-scanner-tail" d="M0-5h300M0-10h300" /></g>
        </g>
      </g></g>
      <g className="entry-map-compass" transform="translate(20 55)"><path d="M0 23V0m-6 8L0 0l6 8M-4 28h8" /><path d="M-3-10v-8l6 8v-8" /></g>
      <g className="entry-map-sea" transform="translate(31 310)"><path d="M0 0q5-5 10 0t10 0t10 0M8 8q5-5 10 0t10 0" /></g>
    </svg>

    <svg className="entry-doodle entry-doodle-top entry-detour-scene" viewBox="0 -18 800 128" fill="none" focusable="false">
      <path className="entry-detour-underlay" d="M32 76h102q18 0 18-18V38q0-18 20-18h168q18 0 18 18v34q0 18 18 18h69q19 0 19-18V42q0-20 20-20h136q18 0 18 18v17q0 19 20 19h106" />
      <path className="entry-detour-route" pathLength="1" d="M32 76h102q18 0 18-18V38q0-18 20-18h168q18 0 18 18v34q0 18 18 18h69q19 0 19-18V42q0-20 20-20h136q18 0 18 18v17q0 19 20 19h106" />
      <path className="entry-detour-blocked" d="M361 49h100" />
      <g className="entry-detour-barricade" transform="translate(388 34)">
        <path d="M0 0h45v18H0Z" /><path d="m3 0 17 18M20 0l18 18M5 18l-4 15m39-15 4 15M-3 33h10m32 0h10" />
        <path className="entry-doodle-spark" d="M12-9v-5m21 5 3-5M-8 8h-5M53 8h5" />
      </g>
      <g className="entry-detour-endpoints">
        <circle cx="32" cy="76" r="8" /><circle cx="32" cy="76" r="3" />
        <path d="M752 62a12 12 0 0 1 24 0c0 8-12 18-12 18s-12-10-12-18Z" /><circle cx="764" cy="62" r="4" />
      </g>
      <g className="entry-route-traveler">
        <path d="M-9-19a9 9 0 0 1 18 0c0 6-9 16-9 16s-9-10-9-16Z" /><circle cx="0" cy="-19" r="3" />
        <ellipse cx="0" cy="1" rx="4" ry="1.6" />
      </g>
    </svg>

    <svg className="entry-doodle entry-doodle-right entry-street-scene" viewBox="0 0 260 620" fill="none" focusable="false">
      <g className="entry-street-drawing">
        <path className="entry-street-edge" pathLength="1" d="M147 15v104q0 23-20 35l-29 17q-19 11-19 35v38q0 25 22 36l44 22q23 12 23 38v25q0 23-20 35l-22 13q-22 13-22 39v144" />
        <path className="entry-street-edge" pathLength="1" d="M191 15v104q0 47-42 72l-29 17v36l44 23q48 25 48 73v25q0 48-42 73l-22 13v145" />
        <path className="entry-street-centre" d="M169 15v104q0 35-31 53l-29 17q-8 5-8 17v38q0 12 11 17l43 22q35 18 35 57v25q0 35-31 54l-22 13q-11 6-11 20v144" />
        <path className="entry-road-hatching" d="m149 36 40 0m-40 6h40m-40 6h40m-40 6h40m-40 6h40M106 550h40m-40 6h40m-40 6h40m-40 6h40m-40 6h40" />
      </g>
      <g className="entry-bus-traveler">
        <g className="entry-bus-exhaust"><path d="M-10-40q-10-4-5-11t-2-14M4-41q8-8 1-14t-1-12" /><circle cx="-13" cy="-72" r="5" /><circle cx="6" cy="-77" r="3" /></g>
        <g className="entry-bus-vehicle">
          <rect x="-18" y="-35" width="36" height="70" rx="9" />
          <path d="M-17 20h34M-16-23h32M-12 25q12 5 24 0v-8h-24Zm0-49v-5h24v5M-10-14h20v22h-20Z" />
          <path d="M-18-16h-4v10h4m36-10h4v10h-4M-18 13h-4v10h4m36-10h4v10h-4M-18 26l-5 3m41-3 5 3" />
          <path className="entry-bus-detail" d="M-6-10H6M-6-6H6M-6-2H6M-6 2H6M-12 31h5m14 0h5M-12-32h4m16 0h4" />
          <path d="M-23 30v5m46-5v5" />
        </g>
      </g>
      <g className="entry-stop-sign" transform="translate(29 220)">
        <path d="m0 8 8-8h16l8 8v16l-8 8H8l-8-8Z" /><path d="M16 32v54M8 86h16" />
        <text x="16" y="20" textAnchor="middle">STOP</text><path d="M-4 91h41m-34 5h21" />
      </g>
      <g className="entry-direction-sign" transform="translate(178 464)">
        <path d="M0 0h40l10 12-10 12H0Zm18 24v69m-9 0h18M8 12h29m-6-5 6 5-6 5" />
        <path d="M2 36h37v21H2Zm10 11h18m-12-5-6 5 6 5" />
      </g>
      <g className="entry-walker-position" transform="translate(31 483)">
        <g className="entry-walker-stride">
          <path className="entry-walker-arm entry-walker-arm-back" d="M22 27c4 0 8 7 10 12l6 10c1 3-3 5-5 2l-8-9-6-8Z" />
          <g className="entry-walker-leg entry-walker-leg-back"><path d="M18 49h10l-1 17 9 14-5 4-13-15-4-12Z" /><path className="entry-walker-shoe" d="m31 81 3 7h10l-8-9Z" /></g>
          <g className="entry-walker-leg entry-walker-leg-front"><path d="M12 49h12l-6 19-7 17H4l5-20Z" /><path className="entry-walker-shoe" d="m4 82-2 7h12l1-4Z" /></g>
          <path className="entry-walker-body" d="M13 24c4-4 10-4 15 0l4 27c-6 5-17 4-23 0l1-18Z" />
          <path className="entry-walker-pack" d="M10 28H6c-5 0-5 20-1 20h5m-5-14h5m2-10 5 8" />
          <path className="entry-walker-arm entry-walker-arm-front" d="M24 28c4 1 3 5 1 8l-7 8-9 4c-3 1-5-3-2-5l8-5 5-8Z" />
          <path className="entry-walker-head" d="M15 8c0-6 12-8 15-1l1 9-4 6-10-3-3-5Z" />
          <path className="entry-walker-hair" d="M14 12q-5-11 3-13t13 4l1 7-6-4-4 4-1 7-5-2" />
          <path className="entry-walker-face" d="M28 12h2m-8 6h5" />
        </g>
      </g>
      <g className="entry-street-flourishes"><path d="m40 383-7-7m13 0 2-8m-16 16-9 1M222 178l8-6m-5 16h10m-14 9 6 7M23 585q-4-12 4-19m-3 12q-8-3-8-10m11 0q7 0 8-7" /><circle cx="43" cy="119" r="3" /><circle cx="223" cy="585" r="3" /></g>
    </svg>
  </div>;
}
