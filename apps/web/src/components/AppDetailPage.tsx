import { useState, useEffect, type FormEvent } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import {
  getApp,
  updateApp,
  deleteType,
  createType,
  type App,
  type AppType,
} from '../api/apps-client';

export function AppDetailPage() {
  const { appId } = useParams<{ appId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [app, setApp] = useState<App | null>(null);
  const [types, setTypes] = useState<AppType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Create type form
  const [showCreate, setShowCreate] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');

  // Inline app name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (!appId) return;
    getApp(appId)
      .then((res) => {
        setApp(res.app);
        setTypes(res.types);
        setEditName(res.app.name);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [appId]);

  const handleCreateType = async (e: FormEvent) => {
    e.preventDefault();
    if (!appId) return;
    setError('');
    try {
      const res = await createType(appId, {
        name: newTypeName,
        description: newTypeDescription || undefined,
      });
      setTypes((prev) => [...prev, res.type]);
      setNewTypeName('');
      setNewTypeDescription('');
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create type');
    }
  };

  const handleDeleteType = async (typeId: string) => {
    if (!appId) return;
    try {
      await deleteType(appId, typeId);
      setTypes((prev) => prev.filter((t) => t.id !== typeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete type');
    }
  };

  const handleSaveName = async () => {
    if (!appId || !editName.trim()) return;
    try {
      const res = await updateApp(appId, { name: editName.trim() });
      setApp(res.app);
      setIsEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update app');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">App not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
              &larr; Apps
            </Link>
            <span className="text-gray-300">/</span>
            {isEditingName ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') {
                    setEditName(app.name);
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="rounded border border-blue-300 px-2 py-1 text-lg font-semibold text-gray-900 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="text-lg font-semibold text-gray-900 hover:text-blue-600"
              >
                {app.icon || '📦'} {app.name}
              </button>
            )}
          </div>
          <span className="text-sm text-gray-500">{user?.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {app.description && (
          <p className="mb-6 text-sm text-gray-500">{app.description}</p>
        )}

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Types</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Type
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Create Type Form */}
        {showCreate && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-medium text-gray-900">New Type</h3>
            <form onSubmit={handleCreateType} className="space-y-4">
              <div>
                <label htmlFor="type-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="type-name"
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  required
                  autoFocus
                  placeholder="e.g., Contact, Task, Project"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="type-desc" className="mb-1 block text-sm font-medium text-gray-700">
                  Description (optional)
                </label>
                <input
                  id="type-desc"
                  type="text"
                  value={newTypeDescription}
                  onChange={(e) => setNewTypeDescription(e.target.value)}
                  placeholder="What does this type represent?"
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

        {/* Types List */}
        {types.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">
              No types yet. Add a type to define the data structures for this app.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {types.map((type) => (
              <div
                key={type.id}
                className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <Link
                  to={`/apps/${appId}/types/${type.id}`}
                  className="flex-1"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{type.icon || '📋'}</span>
                    <div>
                      <h3 className="font-medium text-gray-900">{type.name}</h3>
                      {type.description && (
                        <p className="text-sm text-gray-500">{type.description}</p>
                      )}
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => handleDeleteType(type.id)}
                  className="hidden rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 group-hover:block"
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
