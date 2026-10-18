import React from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './redesign.css';
import './bilingual.css';
import './privacy.css';
import './community.css';
import './fuel.css';
import './map-time.css';
import './pipeline.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
