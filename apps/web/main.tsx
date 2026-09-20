import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../shared/App.tsx';
import { ErrorBoundary } from '../../shared/components/ErrorBoundary';
import '../../shared/index.css';
import '../../shared/i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
