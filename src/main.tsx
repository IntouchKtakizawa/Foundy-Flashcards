import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { db, requestPersistentStorage } from '@/db/database';
import './index.css';

// Open the database early and ask the browser to treat our storage as
// persistent, so decks are not evicted under storage pressure.
db.open().catch((err) => console.error('Failed to open the local database', err));
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
