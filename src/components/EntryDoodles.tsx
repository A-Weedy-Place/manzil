import { useEffect, useId, useState } from 'react';
import { entryRoadNetwork } from './entryRoadNetwork';
import { entryCountryViewBox, pakistanOutline } from './entryCountryOutline';
import EntryIntersection from './EntryIntersection';

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
    <svg className="entry-doodle entry-doodle-left entry-pakistan-scene" viewBox={entryCountryViewBox} fill="none" focusable="false">
      <defs>
        <clipPath id={borderClip}><path d={pakistanOutline} fill="#fff" /></clipPath>
        <clipPath id={scanClip} clipPathUnits="userSpaceOnUse"><rect className="entry-pakistan-reveal" x="0" y="0" width="300" height="284" fill="#fff" /></clipPath>
      </defs>
      <g className="entry-pakistan-cycle">
        <path className="entry-pakistan-outline" d={pakistanOutline} pathLength="1" vectorEffect="non-scaling-stroke" />
        <g clipPath={`url(#${borderClip})`}>
          <g clipPath={`url(#${scanClip})`} className="entry-pakistan-roads">
            {entryRoadNetwork.map((road, index) => <path key={index} className={`entry-pakistan-road-${road.kind}`} d={road.d} />)}
          </g>
          <g className="entry-pakistan-scanner"><path d="M0 0h300" /><path className="entry-scanner-tail" d="M0-5h300M0-10h300" /></g>
        </g>
      </g>
      <g className="entry-map-compass" transform="translate(20 55)"><path d="M0 23V0m-6 8L0 0l6 8M-4 28h8" /><path d="M-3-10v-8l6 8v-8" /></g>
      <g className="entry-map-sea" transform="translate(31 250)"><path d="M0 0q5-5 10 0t10 0t10 0M8 8q5-5 10 0t10 0" /></g>
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
