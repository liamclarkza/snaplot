import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing chart lab root');
const DefaultsAudit = lazy(() => import('./audit/DefaultsAudit'));
const auditMode = new URLSearchParams(window.location.search).get('audit') === 'defaults';
createRoot(root).render(<StrictMode><Suspense fallback={<p>Loading chart lab…</p>}>{auditMode ? <DefaultsAudit /> : <App />}</Suspense></StrictMode>);
