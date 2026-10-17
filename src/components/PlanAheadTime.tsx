import { useEffect, useId, useState } from 'react';
import { ArrowRight, CalendarClock, Radio } from 'lucide-react';
import { dayDate, inputISO, localInput, time } from '../lib/format';
import { t } from '../lib/language';

interface Props {
  at: string;
  onChange: (localDateTime: string) => void;
  onLive: () => void;
}

export default function PlanAheadTime({ at, onChange, onLive }: Props) {
  const [value, setValue] = useState(() => localInput(new Date(at)));
  const [error, setError] = useState('');
  const inputId = useId();
  const errorId = `${inputId}-error`;
  useEffect(() => {
    setValue(localInput(new Date(at)));
    setError('');
  }, [at]);

  function showMap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = String(new FormData(event.currentTarget).get('previewAt') ?? '');
    try {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(submitted) || localInput(new Date(inputISO(submitted))) !== submitted) {
        throw new Error('Invalid local date');
      }
      setError('');
      onChange(submitted);
    } catch {
      setError('Choose a valid date and time.');
    }
  }

  return <section className="plan-ahead-time" aria-label={t('Plan ahead time')}>
    <div className="plan-ahead-selected">
      <CalendarClock size={20} aria-hidden="true" />
      <div>
        <span>{t('Viewing map for')}</span>
        <time dateTime={at}>{dayDate(at)} <span>·</span> {time(at)} <small>{t('PKT')}</small></time>
      </div>
    </div>
    <form onSubmit={showMap} noValidate>
      <label className="field-label" htmlFor={inputId}>{t('Date & time · Pakistan')}</label>
      <input id={inputId} name="previewAt" type="datetime-local" step="60" required value={value}
        aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
        onChange={event => { setValue(event.currentTarget.value); setError(''); }} />
      {error && <p id={errorId} className="plan-ahead-time-error" role="alert">{t(error)}</p>}
      <button className="primary-button full" type="submit">{t('Show map')}<ArrowRight size={17} aria-hidden="true" /></button>
    </form>
    <button className="text-button plan-ahead-live" type="button" onClick={onLive}><Radio size={16} aria-hidden="true" />{t('Return to live map')}</button>
  </section>;
}
