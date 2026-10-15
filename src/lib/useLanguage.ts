import { useSyncExternalStore } from 'react';
import { getLanguage, setLanguage, subscribeLanguage } from './language';
import type { Language } from '../../shared/speech';
export function useLanguage() { return { language: useSyncExternalStore<Language>(subscribeLanguage, getLanguage, () => 'en'), setLanguage }; }
