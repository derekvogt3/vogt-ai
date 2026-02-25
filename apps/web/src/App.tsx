import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './components/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { DashboardPage } from './components/DashboardPage';
import { AdminPage } from './components/AdminPage';
import { AdminRoute } from './components/AdminRoute';
import { ServiceRoute } from './components/ServiceRoute';
import { RLCPage } from './services/rlc/RLCPage';

export default function App() {
  return (
    <BrowserRouter basename="/app">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Dashboard — shows services user has access to */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Services — each wrapped with ServiceRoute for access control */}
          <Route
            path="/rlc"
            element={
              <ProtectedRoute>
                <ServiceRoute slug="rlc-controls">
                  <RLCPage />
                </ServiceRoute>
              </ProtectedRoute>
            }
          />

          {/* Admin panel */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
