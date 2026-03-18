import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useCompanyStore } from './store/companyStore';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { FeedPage } from './pages/FeedPage';
import { QueuePage } from './pages/QueuePage';
import { BotPage } from './pages/BotPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const initializeCompany = useCompanyStore((state) => state.initializeCompany);

  useEffect(() => {
    // Initialize auth first
    initialize();
    // Then initialize company when auth is ready
    initializeCompany();
  }, [initialize, initializeCompany]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<FeedPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/bot" element={<BotPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
