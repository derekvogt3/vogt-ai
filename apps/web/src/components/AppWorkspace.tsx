import { useState, useEffect, useCallback, createContext, useContext, type FormEvent } from 'react';
import { Outlet, useParams, useNavigate, Link, useLocation } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import {
  getApp,
  createType,
  deleteType,
  updateApp,
  listPages,
  listRecords,
  type App,
  type AppType,
  type Page,
} from '../api/apps-client';
import { AIChatPanel } from './AIChatPanel';
import { EmojiPicker } from './EmojiPicker';

// --- Workspace context shared with child routes ---

type WorkspaceContextType = {
  app: App;
  types: AppType[];
  pages: Page[];
  refreshTypes: () => void;
  refreshPages: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within AppWorkspace');
  return ctx;
}

// --- AppWorkspace ---

export function AppWorkspace() {
  const { appId } = useParams<{ appId: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [app, setApp] = useState<App | null>(null);
  const [types, setTypes] = useState<AppType[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Add table form
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableIcon, setNewTableIcon] = useState('📋');

  // Edit app name & icon
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  // AI chat
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Derive active typeId from URL
  const typeIdMatch = location.pathname.match(/\/t\/([^/]+)/);
  const activeTypeId = typeIdMatch ? typeIdMatch[1] : null;

  // Load app data
  const loadApp = useCallback(async () => {
    if (!appId) return;
    try {
      const [appRes, pagesRes] = await Promise.all([
        getApp(appId),
        listPages(appId),
      ]);
      setApp(appRes.app);
      setTypes(appRes.types);
      setEditName(appRes.app.name);
      setEditIcon(appRes.app.icon || '📦');
      setPages(pagesRes.pages);
      return appRes.types;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
      return [];
    }
  }, [appId]);

  useEffect(() => {
    loadApp().then((loadedTypes) => {
      setIsLoading(false);

      // Auto-navigate to first type if we're at the root /apps/:appId
      if (loadedTypes && loadedTypes.length > 0) {
        const isRootPath = location.pathname === `/apps/${appId}` || location.pathname === `/apps/${appId}/`;
        if (isRootPath) {
          navigate(`/apps/${appId}/t/${loadedTypes[0].id}`, { replace: true });
        }
      }
    });
  }, [appId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch record counts for sidebar
  useEffect(() => {
    if (!appId || types.length === 0) return;
    const counts: Record<string, number> = {};
    Promise.all(
      types.map((t) =>
        listRecords(appId, t.id, 1, 1)
          .then((res) => { counts[t.id] = res.total; })
          .catch(() => { counts[t.id] = 0; })
      )
    ).then(() => setRecordCounts({ ...counts }));
  }, [appId, types]);

  const refreshTypes = useCallback(() => {
    if (!appId) return;
    getApp(appId).then((res) => {
      setApp(res.app);
      setTypes(res.types);
    }).catch(() => {});
  }, [appId]);

  const refreshPages = useCallback(() => {
    if (!appId) return;
    listPages(appId).then((res) => setPages(res.pages)).catch(() => {});
  }, [appId]);

  const handleAddTable = async (e: FormEvent) => {
    e.preventDefault();
    if (!appId || !newTableName.trim()) return;
    setError('');
    try {
      const res = await createType(appId, { name: newTableName.trim(), icon: newTableIcon });
      setTypes((prev) => [...prev, res.type]);
      setNewTableName('');
      setNewTableIcon('📋');
      setShowAddTable(false);
      navigate(`/apps/${appId}/t/${res.type.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table');
    }
  };

  const handleDeleteType = async (typeId: string) => {
    if (!appId) return;
    try {
      await deleteType(appId, typeId);
      setTypes((prev) => prev.filter((t) => t.id !== typeId));
      // If we deleted the active type, navigate to first remaining
      if (activeTypeId === typeId) {
        const remaining = types.filter((t) => t.id !== typeId);
        if (remaining.length > 0) {
          navigate(`/apps/${appId}/t/${remaining[0].id}`, { replace: true });
        } else {
          navigate(`/apps/${appId}`, { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete table');
    }
  };

  const handleSaveName = async () => {
    if (!appId || !editName.trim()) return;
    try {
      const res = await updateApp(appId, { name: editName.trim(), icon: editIcon });
      setApp(res.app);
      setIsEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    }
  };

  const handleIconChange = async (emoji: string) => {
    setEditIcon(emoji);
    if (!appId) return;
    // Save icon immediately
    try {
      const res = await updateApp(appId, { icon: emoji });
      setApp(res.app);
      refreshTypes(); // refresh sidebar
    } catch {
      // revert on failure
      setEditIcon(app?.icon || '📦');
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

  if (!app) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Project not found</p>
      </div>
    );
  }

  return (
    <WorkspaceContext value={{ app, types, pages, refreshTypes, refreshPages }}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Sidebar */}
        <aside className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
          {/* Sidebar header */}
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
                ← Projects
              </Link>
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Logout
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <EmojiPicker value={editIcon || '📦'} onChange={handleIconChange} size="sm" />
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
                  className="w-full rounded border border-blue-300 px-1.5 py-0.5 text-sm font-semibold text-gray-900 focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-sm font-semibold text-gray-900 hover:text-blue-600"
                  title="Click to rename"
                >
                  {app.name}
                </button>
              )}
            </div>
          </div>

          {/* Tables list */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Tables
            </div>

            {types.map((type) => (
              <div
                key={type.id}
                className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                  activeTypeId === type.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Link
                  to={`/apps/${appId}/t/${type.id}`}
                  className="flex flex-1 items-center gap-2 min-w-0"
                >
                  <span className="text-sm flex-shrink-0">{type.icon || '📋'}</span>
                  <span className="truncate">{type.name}</span>
                  {recordCounts[type.id] !== undefined && (
                    <span className="ml-auto flex-shrink-0 text-[10px] text-gray-400">
                      {recordCounts[type.id]}
                    </span>
                  )}
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteType(type.id);
                  }}
                  className="ml-1 hidden rounded p-0.5 text-gray-400 hover:text-red-500 group-hover:block"
                >
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))}

            {/* Add table */}
            {showAddTable ? (
              <form onSubmit={handleAddTable} className="mt-1 px-1">
                <div className="flex items-center gap-1.5">
                  <EmojiPicker value={newTableIcon} onChange={setNewTableIcon} size="sm" />
                  <input
                    type="text"
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder="Table name..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowAddTable(false);
                        setNewTableName('');
                        setNewTableIcon('📋');
                      }
                    }}
                    onBlur={() => {
                      if (!newTableName.trim()) {
                        setShowAddTable(false);
                        setNewTableName('');
                        setNewTableIcon('📋');
                      }
                    }}
                    className="w-full rounded border border-blue-300 px-2 py-1 text-sm focus:outline-none"
                  />
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddTable(true)}
                className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                </svg>
                Add Table
              </button>
            )}
          </div>

          {/* Sidebar footer */}
          <div className="border-t border-gray-100 px-2 py-2">
            <button
              onClick={() => setIsChatOpen(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-purple-600 hover:bg-purple-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a8 8 0 00-4.906 14.32l-.896 2.688a.5.5 0 00.632.632l2.688-.896A8 8 0 1010 2z" />
              </svg>
              AI Assistant
            </button>
            <div className="mt-1 px-2 text-[10px] text-gray-400 truncate">
              {user?.email}
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-hidden">
          {error && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
              <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">×</button>
            </div>
          )}

          {types.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="text-center">
                <div className="mb-4 text-4xl">📋</div>
                <h2 className="mb-2 text-lg font-semibold text-gray-900">No tables yet</h2>
                <p className="mb-4 text-sm text-gray-500">
                  Create your first table to start organizing data.
                </p>
                <button
                  onClick={() => setShowAddTable(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Add Table
                </button>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <AIChatPanel
        appId={appId!}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onDataChanged={() => {
          refreshTypes();
          refreshPages();
        }}
      />
    </WorkspaceContext>
  );
}
