import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router';
import { AuthProvider } from './components/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppListPage } from './components/AppListPage';
import { AppWorkspace } from './components/AppWorkspace';
import { TypeView } from './components/TypeView';
import { RecordsTab } from './components/RecordsTab';
import { FieldsTab } from './components/FieldsTab';
import { ViewsTab } from './components/ViewsTab';
import { AutomationsTab } from './components/AutomationsTab';
import { SchemaWizardPage } from './components/SchemaWizardPage';
import { PageBuilderPage } from './components/PageBuilderPage';
import { PageViewPage } from './components/PageViewPage';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';

// Redirect old routes to new ones
function RedirectToType() {
  const { appId, typeId } = useParams<{ appId: string; typeId: string }>();
  return <Navigate to={`/apps/${appId}/t/${typeId}`} replace />;
}

function RedirectToTypeFields() {
  const { appId, typeId } = useParams<{ appId: string; typeId: string }>();
  return <Navigate to={`/apps/${appId}/t/${typeId}/fields`} replace />;
}

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

          {/* Project workspace with sidebar */}
          <Route
            path="/apps/:appId"
            element={
              <ProtectedRoute>
                <AppWorkspace />
              </ProtectedRoute>
            }
          >
            {/* TypeView with tabs */}
            <Route path="t/:typeId" element={<TypeView />}>
              <Route index element={<RecordsTab />} />
              <Route path="fields" element={<FieldsTab />} />
              <Route path="views" element={<ViewsTab />} />
              <Route path="automations" element={<AutomationsTab />} />
            </Route>

            {/* Schema wizard (AI-powered) */}
            <Route path="schema-wizard" element={<SchemaWizardPage />} />
          </Route>

          {/* Full-screen page builder (standalone) */}
          <Route
            path="/apps/:appId/pages/:pageId/edit"
            element={
              <ProtectedRoute>
                <PageBuilderPage />
              </ProtectedRoute>
            }
          />

          {/* Published page view */}
          <Route
            path="/apps/:appId/p/:pageSlug"
            element={
              <ProtectedRoute>
                <PageViewPage />
              </ProtectedRoute>
            }
          />

          {/* Backwards compatibility redirects */}
          <Route
            path="/apps/:appId/types/:typeId"
            element={
              <ProtectedRoute>
                <RedirectToType />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apps/:appId/types/:typeId/build"
            element={
              <ProtectedRoute>
                <RedirectToTypeFields />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
