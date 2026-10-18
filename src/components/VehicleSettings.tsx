import { useEffect, useId, useState } from 'react';
import { Car, Check, Fuel } from 'lucide-react';
import type { FuelPriceStatus, VehicleProfile } from '../../shared/types';
import { t } from '../lib/language';
import FuelPrices from './FuelPrices';

interface Props { vehicle?: VehicleProfile; status?: FuelPriceStatus; busy: boolean; showFuelPrices?: boolean; onSave: (vehicle: VehicleProfile) => Promise<void> }
export default function VehicleSettings({ vehicle, status, busy, showFuelPrices = true, onSave }: Props) {
  const [kind, setKind] = useState<VehicleProfile['kind']>(vehicle?.kind ?? 'car');
  const [label, setLabel] = useState(vehicle?.label ?? '');
  const [fuelType, setFuelType] = useState<VehicleProfile['fuelType']>(vehicle?.fuelType ?? 'petrol');
  const [mileage, setMileage] = useState(vehicle?.kmPerLitre?.toString() ?? '');
  const [error, setError] = useState('');
  const errorId = useId(), mileageId = useId();
  useEffect(() => { setKind(vehicle?.kind ?? 'car'); setLabel(vehicle?.label ?? ''); setFuelType(vehicle?.fuelType ?? 'petrol'); setMileage(vehicle?.kmPerLitre?.toString() ?? ''); setError(''); }, [vehicle?.kind, vehicle?.label, vehicle?.fuelType, vehicle?.kmPerLitre]);
  async function save() {
    const kmPerLitre = mileage.trim() ? Number(mileage) : null;
    if (kmPerLitre !== null && (!Number.isFinite(kmPerLitre) || kmPerLitre < 1 || kmPerLitre > 200)) { setError('Enter mileage from 1 to 200 km/litre.'); return; }
    setError(''); await onSave({ kind, label: label.trim(), fuelType, kmPerLitre });
  }
  return <section className="settings-section vehicle-settings"><h2><Car size={20} />{t('Your vehicle')}</h2><form onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={busy}>
    <div className="vehicle-fields"><label className="field-label">{t('Vehicle type')}<select value={kind} disabled={busy} onChange={event => setKind(event.target.value as VehicleProfile['kind'])}><option value="car">{t('Car')}</option><option value="motorcycle">{t('Motorcycle')}</option></select></label><label className="field-label">{t('Fuel type')}<select value={fuelType} disabled={busy} onChange={event => setFuelType(event.target.value as VehicleProfile['fuelType'])}><option value="petrol">{t('Petrol')}</option><option value="diesel">{t('Diesel')}</option></select></label></div>
    <label className="field-label">{t('Vehicle name (optional)')}<input value={label} disabled={busy} maxLength={80} placeholder={t('For example, Honda CD 70')} onChange={event => setLabel(event.target.value)} /></label>
    <div className="field-label"><label htmlFor={mileageId}>{t('Mileage (km/litre)')}</label><span className="mileage-input"><input id={mileageId} type="number" inputMode="decimal" min="1" max="200" step="any" value={mileage} disabled={busy} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} placeholder="15" onChange={event => { setMileage(event.target.value); setError(''); }} /><span aria-hidden="true">{t('km/litre')}</span></span></div>
    {error && <p className="error-box" role="alert" id={errorId}>{t(error)}</p>}
    <p className="small muted">{t('Add your usual fuel economy for route and recorded-trip cost estimates. Leave it empty to turn estimates off.')}</p>
    {kind === 'motorcycle' && <p className="small muted">{t('Motorcycle is used for fuel estimates. Routes and time estimates still use the current car-road network.')}</p>}
    <button type="submit" className="secondary-button" disabled={busy}><Check size={17} />{t('Save vehicle')}</button>
  </form>{showFuelPrices && <><div className="vehicle-fuel-caption"><Fuel size={17} /><span>{t('Estimated fuel cost')}</span></div><FuelPrices status={status} /></>}</section>;
}
