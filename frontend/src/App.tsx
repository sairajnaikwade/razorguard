import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import RiskAnalyticsPage from './pages/RiskAnalyticsPage';
import TransactionsPage from './pages/TransactionsPage';
import TransactionInvestigationPage from './pages/TransactionInvestigationPage';
import SystemStatusPage from './pages/SystemStatusPage';
import AppLayout from './layouts/AppLayout';
import { useAuthStore } from './store/authStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  if (!token) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><OverviewPage /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><RiskAnalyticsPage /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
        <Route
          path="/transactions/:transactionId"
          element={<ProtectedRoute><TransactionInvestigationPage /></ProtectedRoute>}
        />
        <Route path="/status" element={<ProtectedRoute><SystemStatusPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
