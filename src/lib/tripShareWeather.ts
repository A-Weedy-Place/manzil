import { weatherCondition, type WeatherReading } from '../../shared/weather';

/** Canvas-native symbols keep a shared PNG independent of icon fonts or remote assets. */
function weatherIcon(context: CanvasRenderingContext2D, icon: ReturnType<typeof weatherCondition>['icon'], x: number, y: number, size: number) {
  context.save(); context.translate(x, y); context.scale(size / 40, size / 40);
  context.strokeStyle = '#dbe9e5'; context.fillStyle = '#dbe9e5'; context.lineWidth = 2.2; context.lineCap = context.lineJoin = 'round';
  const line = (x1: number, y1: number, x2: number, y2: number) => { context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke(); };
  const sun = (cx: number, cy: number, radius: number) => {
    context.beginPath(); context.arc(cx, cy, radius, 0, 2 * Math.PI); context.stroke();
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      line(cx + Math.cos(angle) * (radius + 4), cy + Math.sin(angle) * (radius + 4), cx + Math.cos(angle) * (radius + 7), cy + Math.sin(angle) * (radius + 7));
    }
  };
  const moon = (cx: number, cy: number, radius: number) => {
    context.beginPath(); context.arc(cx, cy, radius, -.35 * Math.PI, 1.35 * Math.PI);
    context.bezierCurveTo(cx - radius * .2, cy + radius * .4, cx - radius * .2, cy - radius * .4, cx + radius * .45, cy - radius * .89); context.stroke();
  };
  const cloud = () => {
    context.beginPath(); context.moveTo(10, 28); context.bezierCurveTo(-1, 28, 0, 15, 10, 15);
    context.bezierCurveTo(12, 4, 28, 4, 30, 16); context.bezierCurveTo(41, 14, 44, 28, 32, 28);
    context.closePath(); context.fillStyle = '#102a26'; context.fill(); context.stroke();
  };
  if (icon === 'sun') sun(20, 20, 7);
  else if (icon === 'moon') moon(20, 20, 13);
  else if (icon === 'unknown') { context.font = '600 27px system-ui, sans-serif'; context.textAlign = 'center'; context.fillText('?', 20, 30); }
  else {
    if (icon === 'cloud-sun') sun(12, 11, 5);
    else if (icon === 'cloud-moon') moon(12, 10, 8);
    cloud();
    if (icon === 'fog') { line(5, 33, 35, 33); line(10, 38, 29, 38); }
    else if (icon === 'rain' || icon === 'drizzle') {
      for (const cx of [11, 22, 33]) line(cx, 33, cx - (icon === 'rain' ? 3 : 1), icon === 'rain' ? 39 : 35);
    } else if (icon === 'snow') {
      for (const cx of [12, 29]) { line(cx - 3, 35, cx + 3, 35); line(cx, 32, cx, 38); }
    } else if (icon === 'thunderstorm') {
      context.beginPath(); context.moveTo(22, 29); context.lineTo(16, 35); context.lineTo(22, 35); context.lineTo(18, 40); context.stroke();
      line(9, 33, 7, 38); line(33, 33, 31, 38);
    }
  }
  context.restore();
}

/** Draws only a saved Islamabad snapshot. Sharing must never fetch replacement weather. */
export function drawTripShareWeather(context: CanvasRenderingContext2D, reading: WeatherReading | undefined, width: number, height: number): boolean {
  if (!reading || !Number.isFinite(reading.temperatureC) || !Number.isInteger(reading.weatherCode)) return false;
  const condition = weatherCondition(reading.weatherCode, reading.isDay);
  context.save(); context.textAlign = 'right'; context.textBaseline = 'alphabetic';
  context.fillStyle = '#dbe9e5'; context.font = '500 22px system-ui, sans-serif';
  const text = `Islamabad · ${Math.round(reading.temperatureC)}°C`, right = width - 60;
  context.fillText(text, right, 155);
  weatherIcon(context, condition.icon, right - context.measureText(text).width - 46, 128, 34);
  context.font = '400 16px system-ui, sans-serif'; context.fillStyle = '#bbcec8';
  context.fillText('Weather · Open-Meteo model · open-meteo.com', width - 48, height - 46);
  context.restore(); return true;
}
