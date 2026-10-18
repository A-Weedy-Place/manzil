import type { Coordinate, MapStyleId, Trip } from '../../shared/types';
import { loadMapStyle } from './mapStyle';
import { tripTraceBounds, tripTraceSections, usableTracePoints } from './tripTrace';
import { drawTripShareWeather } from './tripShareWeather';

const WIDTH = 1080, HEIGHT = 1360, MAP_HEIGHT = 640;
export interface TripShareImage { blob: Blob; basemap: 'map' | 'illustration' }
interface MapImage { canvas: HTMLCanvasElement; endpoints: { x: number; y: number }[] }
const abort = () => new DOMException('Sharing cancelled.', 'AbortError');
function check(signal: AbortSignal) { if (signal.aborted) throw abort(); }
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancelled = () => reject(abort()); signal.addEventListener('abort', cancelled, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancelled));
    if (signal.aborted) cancelled();
  });
}
function surface(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('This browser cannot create a trip image.');
  return { canvas, context };
}
function brandLogo(signal: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image(); let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return; settled = true; clearTimeout(timeout); signal.removeEventListener('abort', cancelled);
      image.onload = image.onerror = null; if (!loaded) image.removeAttribute('src'); resolve(loaded ? image : null);
    };
    const cancelled = () => finish(false), timeout = setTimeout(() => finish(false), 1500);
    image.onload = () => finish(true); image.onerror = () => finish(false);
    signal.addEventListener('abort', cancelled, { once: true }); image.decoding = 'async'; image.src = '/manzil-logo.png';
    if (signal.aborted) cancelled();
  });
}

/** A disposable map: the existing public provider receives tile requests only,
 * never trip JSON, identity or trace arrays. No image or private record is uploaded. */
async function basemap(trip: Trip, style: MapStyleId, signal: AbortSignal): Promise<MapImage> {
  const [maplibre, specification] = await abortable(Promise.all([import('maplibre-gl'), loadMapStyle(style, 'clean', signal)]), signal);
  check(signal);
  const points = usableTracePoints(trip.points), bounds = tripTraceBounds(points), sections = tripTraceSections(trip.points);
  const container = document.createElement('div'); container.setAttribute('aria-hidden', 'true');
  Object.assign(container.style, { position: 'fixed', left: '-12000px', top: '0', width: `${WIDTH}px`, height: `${MAP_HEIGHT}px`, pointerEvents: 'none' });
  document.body.appendChild(container);
  let map: InstanceType<typeof maplibre.Map> | undefined;
  try {
    map = new maplibre.Map({ container, style: specification, bounds, fitBoundsOptions: { padding: 90, maxZoom: 16 },
      interactive: false, attributionControl: false, canvasContextAttributes: { preserveDrawingBuffer: true },
      pixelRatio: 1, renderWorldCopies: false, fadeDuration: 0, pitch: 0, bearing: 0 });
    const rendered = map;
    return await new Promise<MapImage>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return; settled = true; clearTimeout(timeout); signal.removeEventListener('abort', cancelled);
        if (error) { reject(error); return; }
        try {
          check(signal);
          const { canvas, context } = surface(WIDTH, MAP_HEIGHT);
          context.drawImage(rendered.getCanvas(), 0, 0, WIDTH, MAP_HEIGHT);
          resolve({ canvas, endpoints: [points[0], points.at(-1)!].map(point => { const screen = rendered.project(point.coordinate); return { x: screen.x, y: screen.y }; }) });
        } catch (failure) { reject(failure); }
      };
      const cancelled = () => finish(abort());
      const timeout = setTimeout(() => finish(new Error('Map image timed out.')), 10000);
      signal.addEventListener('abort', cancelled, { once: true });
      rendered.on('error', () => finish(new Error('Map tiles could not load.')));
      rendered.on('load', () => {
        if (settled) return;
        try {
          rendered.addSource('share-trip', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: sections } } });
          rendered.addLayer({ id: 'share-trip-halo', type: 'line', source: 'share-trip', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 17 } });
          rendered.addLayer({ id: 'share-trip-line', type: 'line', source: 'share-trip', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#12bd78', 'line-width': 10 } });
          rendered.once('idle', () => finish()); rendered.triggerRepaint();
        } catch (failure) { finish(failure instanceof Error ? failure : new Error('Map image unavailable.')); }
      });
      if (signal.aborted) cancelled();
    });
  } finally { map?.remove(); container.remove(); }
}

/** Local geographic fallback only when tiles/WebGL are unavailable; never fake streets. */
function routeIllustration(trip: Trip): MapImage {
  const { canvas, context } = surface(WIDTH, MAP_HEIGHT), points = usableTracePoints(trip.points), bounds = tripTraceBounds(points);
  const centreLatitude = (bounds[0][1] + bounds[1][1]) / 2, cosine = Math.cos(centreLatitude * Math.PI / 180);
  const spanX = Math.max(.0001, (bounds[1][0] - bounds[0][0]) * cosine), spanY = Math.max(.0001, bounds[1][1] - bounds[0][1]);
  const scale = Math.min((WIDTH - 180) / spanX, (MAP_HEIGHT - 180) / spanY);
  const centre: Coordinate = [(bounds[0][0] + bounds[1][0]) / 2, centreLatitude];
  const project = ([longitude, latitude]: Coordinate) => ({ x: WIDTH / 2 + (longitude - centre[0]) * cosine * scale, y: MAP_HEIGHT / 2 - (latitude - centre[1]) * scale });
  context.fillStyle = '#182e37'; context.fillRect(0, 0, WIDTH, MAP_HEIGHT);
  context.strokeStyle = '#29444d'; context.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 72) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, MAP_HEIGHT); context.stroke(); }
  for (let y = 0; y < MAP_HEIGHT; y += 72) { context.beginPath(); context.moveTo(0, y); context.lineTo(WIDTH, y); context.stroke(); }
  for (const colour of ['#fff', '#12bd78']) {
    context.strokeStyle = colour; context.lineWidth = colour === '#fff' ? 17 : 10; context.lineJoin = context.lineCap = 'round';
    for (const section of tripTraceSections(trip.points)) {
      context.beginPath(); section.forEach((coordinate, index) => { const p = project(coordinate); if (index) context.lineTo(p.x, p.y); else context.moveTo(p.x, p.y); }); context.stroke();
    }
  }
  context.fillStyle = '#d5e7e1'; context.font = '600 20px system-ui, sans-serif'; context.fillText('N ↑', WIDTH - 85, 45);
  return { canvas, endpoints: [points[0], points.at(-1)!].map(point => project(point.coordinate)) };
}

const englishNumber = (value: number, decimals = 0) => value.toLocaleString('en-PK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
function fitText(context: CanvasRenderingContext2D, value: string, width: number) {
  if (context.measureText(value).width <= width) return value;
  let text = value; while (text.length && context.measureText(`${text}…`).width > width) text = text.slice(0, -1);
  return `${text}…`;
}
function rounded(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, colour: string) {
  context.fillStyle = colour; context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill();
}
function imageBlob(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => { if (signal.aborted) reject(abort()); else if (blob) resolve(blob); else reject(new Error('Could not create the PNG image.')); }, 'image/png'));
}

/** Creates a preview in memory after explicit Share; callers own its object URL. */
export async function renderTripShareImage(trip: Trip, options: { signal: AbortSignal; mapStyle?: MapStyleId }): Promise<TripShareImage> {
  check(options.signal); tripTraceBounds(trip.points);
  const logoPromise = brandLogo(options.signal);
  const controller = new AbortController(), cancel = () => controller.abort(); options.signal.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, 15000);
  let image: MapImage, kind: TripShareImage['basemap'] = 'map';
  try {
    try { image = await basemap(trip, options.mapStyle ?? 'outdoors', controller.signal); }
    catch { check(options.signal); kind = 'illustration'; image = routeIllustration(trip); }
    check(options.signal);
    const logo = await logoPromise; check(options.signal);
    const { canvas, context } = surface(WIDTH, HEIGHT);
    context.fillStyle = '#102a26'; context.fillRect(0, 0, WIDTH, HEIGHT);
    if (logo) {
      context.save(); context.beginPath(); context.arc(90, 76, 39, 0, 2 * Math.PI); context.fillStyle = '#fff'; context.fill(); context.clip();
      context.drawImage(logo, 51, 37, 78, 78); context.restore();
    }
    context.fillStyle = '#8be0bb'; context.font = '700 56px Georgia, serif'; context.fillText('manzil.', logo ? 150 : 60, 88);
    context.fillStyle = '#dbe9e5'; context.font = '500 22px system-ui, sans-serif'; context.fillText('MY JOURNEY', 60, 154);
    context.textAlign = 'right'; context.font = '500 22px system-ui, sans-serif';
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(trip.startedAt));
    context.fillText(date, WIDTH - 60, 82);
    context.font = '400 20px system-ui, sans-serif';
    context.fillText(`${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit' }).format(new Date(trip.startedAt))} PKT`, WIDTH - 60, 119);
    context.textAlign = 'left'; context.font = '650 36px system-ui, sans-serif'; context.fillStyle = '#fff';
    context.fillText(fitText(context, trip.name, WIDTH - 120), 60, 204);
    context.save(); context.beginPath(); context.roundRect(36, 240, WIDTH - 72, MAP_HEIGHT, 28); context.clip();
    context.drawImage(image.canvas, 36, 240, WIDTH - 72, MAP_HEIGHT);
    image.endpoints.forEach((point, index) => {
      const x = 36 + point.x * (WIDTH - 72) / WIDTH, y = 240 + point.y;
      context.beginPath(); context.arc(x, y, 25, 0, 2 * Math.PI); context.fillStyle = index ? '#07834f' : '#ffffff'; context.fill(); context.strokeStyle = index ? '#fff' : '#07834f'; context.lineWidth = 5; context.stroke();
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = '750 24px system-ui, sans-serif'; context.fillStyle = index ? '#fff' : '#07834f'; context.fillText(index ? 'E' : 'S', x, y + 1);
    });
    context.restore(); context.textAlign = 'left'; context.textBaseline = 'alphabetic';
    context.font = '400 16px system-ui, sans-serif'; context.fillStyle = '#bbcec8';
    context.fillText(kind === 'map' ? 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors' : 'Route illustration · basemap unavailable', 48, 909);
    if (kind === 'map') { context.font = '400 14px system-ui, sans-serif'; context.fillText('openstreetmap.org/copyright', 48, 932); }
    const first = usableTracePoints(trip.points)[0], last = usableTracePoints(trip.points).at(-1)!;
    const parts = trip.name.split(/\s*[→➜]\s*/);
    const endpointName = (index: number) => parts.length === 2 ? parts[index] : `${index ? last.coordinate[1].toFixed(4) : first.coordinate[1].toFixed(4)}° N, ${index ? last.coordinate[0].toFixed(4) : first.coordinate[0].toFixed(4)}° E`;
    rounded(context, 48, 961, WIDTH - 96, 100, 20, '#1d3c35');
    for (let index = 0; index < 2; index++) {
      const x = index ? 560 : 72; context.fillStyle = '#9ac7b6'; context.font = '500 18px system-ui, sans-serif'; context.fillText(index ? 'END' : 'START', x, 992);
      context.fillStyle = '#fff'; context.font = '650 24px system-ui, sans-serif'; context.fillText(fitText(context, endpointName(index), 430), x, 1031);
    }
    const minutes = Math.round(trip.durationSeconds / 60), values = [
      ['DISTANCE', `${englishNumber(trip.distanceMeters / 1000, 1)} km`],
      ['TRAVEL TIME', minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`],
      ['EST. FUEL COST', trip.fuelEstimate ? `≈ PKR ${englishNumber(trip.fuelEstimate.costPkr)}` : 'Unavailable'],
    ];
    values.forEach(([label, value], index) => {
      const x = 48 + index * 337; rounded(context, x, 1085, 310, 132, 20, '#1d3c35');
      context.fillStyle = '#9ac7b6'; context.font = '500 17px system-ui, sans-serif'; context.fillText(label, x + 22, 1122);
      context.fillStyle = '#fff'; context.font = '700 30px system-ui, sans-serif'; context.fillText(fitText(context, value, 268), x + 22, 1171);
    });
    context.fillStyle = '#bbcec8'; context.font = '400 19px system-ui, sans-serif';
    context.fillText(trip.demoData ? 'Simulated journey · fictional GPS and fuel estimate' : 'Recorded journey · fuel cost is an estimate', 48, 1270);
    context.font = '500 18px system-ui, sans-serif'; context.fillText('Plan your way with Manzil', 48, 1314);
    drawTripShareWeather(context, trip.weather, WIDTH, HEIGHT);
    return { blob: await imageBlob(canvas, options.signal), basemap: kind };
  } finally { clearTimeout(deadline); options.signal.removeEventListener('abort', cancel); controller.abort(); }
}

export function downloadTripImage(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
