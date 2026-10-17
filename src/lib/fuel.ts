import { getLanguage } from './language';

export function rupees(value: number, fractionDigits = 0): string {
  return `PKR ${new Intl.NumberFormat(getLanguage() === 'ur' ? 'ur-PK' : 'en-PK', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value)}`;
}
export function fuelDate(value: string): string {
  return new Intl.DateTimeFormat(getLanguage() === 'ur' ? 'ur-PK' : 'en-PK', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}
