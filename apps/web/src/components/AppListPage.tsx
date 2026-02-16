import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { listApps, createApp, deleteApp, type App } from '../api/apps-client';

export function AppListPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    listApps()
      .then((res) => setApps(res.apps))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await createApp({
        name: newName,
        description: newDescription || undefined,
      });
      setApps((prev) => [...prev, res.app]);
      setNewName('');
      setNewDescription('');
      setShowCreate(false);
      navigate(`/apps/${res.app.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create app');
    }
  };

  const handleDelete = async (appId: string) => {
    try {
      await deleteApp(appId);
      setApps((prev) => prev.filter((a) => a.id !== appId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete app');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">vogt-ai</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Your Apps</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create App
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Create App Modal */}
        {showCreate && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-medium text-gray-900">New App</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="app-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="app-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                  placeholder="e.g., CRM, Project Tracker"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="app-desc" className="mb-1 block text-sm font-medium text-gray-700">
                  Description (optional)
                </label>
                <input
                  id="app-desc"
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What is this app for?"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* App Grid */}
        {apps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">No apps yet. Create your first one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => (
              <div
                key={app.id}
                className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <Link to={`/apps/${app.id}`} className="block">
                  <div className="mb-2 text-2xl">{app.icon || '📦'}</div>
                  <h3 className="font-medium text-gray-900">{app.name}</h3>
                  {app.description && (
                    <p className="mt-1 text-sm text-gray-500">{app.description}</p>
                  )}
                </Link>
                <button
                  onClick={() => handleDelete(app.id)}
                  className="absolute right-3 top-3 hidden rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 group-hover:block"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
