import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './components/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppListPage } from './components/AppListPage';
import { AppDetailPage } from './components/AppDetailPage';
import { TypeBuilderPage } from './components/TypeBuilderPage';
import { RecordListPage } from './components/RecordListPage';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';

export default function App() {
  return (
    <BrowserRouter basename="/app">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apps/:appId"
            element={
              <ProtectedRoute>
                <AppDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apps/:appId/types/:typeId"
            element={
              <ProtectedRoute>
                <RecordListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apps/:appId/types/:typeId/build"
            element={
              <ProtectedRoute>
                <TypeBuilderPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
