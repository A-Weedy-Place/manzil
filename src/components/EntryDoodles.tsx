import { useEffect, useId, useState } from 'react';
import { entryRoadNetwork } from './entryRoadNetwork';
import EntryIntersection from './EntryIntersection';

// Schematic illustration including Pakistan's claimed Kashmir region, with the
// Survey of Pakistan's 2020 political map as reference (government reproduction:
// https://www.ppib.gov.pk/pakistan.html). Not boundary, search or routing data.
const pakistanOutline = 'M186 15 194 13 200 15 207 12 211 7 218 10 222 8 227 13 231 15 233 22 234 35 237 43 244 45 251 51 260 52 265 78 272 109 274 134 268 137 265 129 260 131 255 128 248 123 244 124 238 133 236 143 231 150 230 156 223 161 219 166 219 177 219 188 216 191 217 195 212 205 208 211 208 217 202 223 199 222 195 242 189 261 183 273 180 284 171 287 160 291 158 283 154 282 149 291 146 303 142 312 140 322 144 326 149 326 150 339 149 350 154 355 158 351 160 367 163 375 164 387 160 389 165 393 160 397 149 395 146 401 139 397 128 396 126 404 120 404 118 413 115 403 108 408 103 394 102 386 98 377 94 376 87 364 80 361 67 362 54 360 44 362 33 361 22 360 12 363 15 340 18 326 27 320 38 316 40 307 34 301 33 285 33 270 24 265 18 255 14 243 6 217 30 234 46 233 54 236 59 231 71 234 88 226 91 219 90 209 92 198 90 193 97 181 103 185 109 181 112 179 110 174 118 170 120 166 123 171 126 167 130 172 134 169 137 163 136 152 138 145 142 135 140 134 142 130 149 128 152 123 152 113 148 111 148 106 146 107 146 102 151 104 156 106 163 103 164 94 162 88 164 79 167 72 171 67 172 60 169 51 169 44 166 40 170 32 175 25 179 20Z';
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
    <svg className="entry-doodle entry-doodle-left entry-pakistan-scene" viewBox="-8 -8 296 444" fill="none" focusable="false">
      <defs>
        <clipPath id={borderClip}><path d={pakistanOutline} fill="#fff" /></clipPath>
        <clipPath id={scanClip} clipPathUnits="userSpaceOnUse"><rect className="entry-pakistan-reveal" x="0" y="0" width="300" height="450" fill="#fff" /></clipPath>
      </defs>
      <g className="entry-pakistan-cycle">
        <path className="entry-pakistan-outline" d={pakistanOutline} pathLength="1" vectorEffect="non-scaling-stroke" />
        <g clipPath={`url(#${borderClip})`}>
          <g clipPath={`url(#${scanClip})`} className="entry-pakistan-roads">
            {entryRoadNetwork.map((road, index) => <path key={index} className={`entry-pakistan-road-${road.kind}`} d={road.d} />)}
            {[[194, 103], [179, 200], [165, 248], [133, 321], [118, 371], [128, 407]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.8" />)}
          </g>
          <g className="entry-pakistan-scanner"><path d="M0 0h300" /><path className="entry-scanner-tail" d="M0-5h300M0-10h300" /></g>
        </g>
      </g>
      <g className="entry-map-compass" transform="translate(20 55)"><path d="M0 23V0m-6 8L0 0l6 8M-4 28h8" /><path d="M-3-10v-8l6 8v-8" /></g>
      <g className="entry-map-sea" transform="translate(31 390)"><path d="M0 0q5-5 10 0t10 0t10 0M8 8q5-5 10 0t10 0" /></g>
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

    <EntryIntersection />
  </div>;
}
