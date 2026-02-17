import { useState, useEffect, type FormEvent } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { createPage, getPage, deletePage, type Page } from '../api/apps-client';
import { useWorkspace } from './AppWorkspace';
import { PageRenderer } from '../registry/page-renderer';
import type { PageConfig } from '../registry/types';

export function ViewsTab() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { pages, refreshPages } = useWorkspace();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [error, setError] = useState('');

  // Active view — show rendered page inline
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<PageConfig | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(false);

  // Auto-select first page if none selected
  useEffect(() => {
    if (pages.length > 0 && !activePageId) {
      openView(pages[0].id);
    }
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const openView = async (pageId: string) => {
    if (!appId) return;
    setActivePageId(pageId);
    setActiveConfig(null);
    setIsLoadingView(true);
    try {
      const res = await getPage(appId, pageId);
      setActiveConfig(res.page.config as unknown as PageConfig);
    } catch {
      setActiveConfig(null);
    } finally {
      setIsLoadingView(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!appId) return;
    setError('');
    try {
      const slug = newSlug || newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const res = await createPage(appId, { name: newName, slug });
      refreshPages();
      setNewName('');
      setNewSlug('');
      setShowCreate(false);
      // Navigate to builder for brand new views (they need components added)
      navigate(`/apps/${appId}/pages/${res.page.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create view');
    }
  };

  const handleDelete = async (pageId: string) => {
    if (!appId) return;
    try {
      await deletePage(appId, pageId);
      if (activePageId === pageId) {
        setActivePageId(null);
        setActiveConfig(null);
      }
      refreshPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete view');
    }
  };

  const activePage = pages.find((p) => p.id === activePageId);

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Create view form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-medium text-gray-900">New View</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="view-name" className="mb-1 block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                id="view-name"
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                }}
                required
                autoFocus
                placeholder="e.g., Dashboard, Contact List"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="view-slug" className="mb-1 block text-sm font-medium text-gray-700">
                URL Slug
              </label>
              <input
                id="view-slug"
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
                placeholder="e.g., dashboard"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Create & Edit
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

      {pages.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <p className="mb-3 text-gray-500">
            No views yet. Create a view to build a custom page layout.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create View
          </button>
        </div>
      ) : pages.length > 0 ? (
        <div>
          {/* View selector bar */}
          <div className="mb-4 flex items-center gap-2 border-b border-gray-200 pb-3">
            <div className="flex flex-1 flex-wrap gap-1.5">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => openView(page.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activePageId === page.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {page.name}
                  {page.published && (
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" title="Published" />
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex-shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              + New View
            </button>
          </div>

          {/* Active view render */}
          {activePage && (
            <div>
              {/* View header with actions */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-gray-700">{activePage.name}</h3>
                  {activePage.published ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      Published
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                      Draft
                    </span>
                  )}
                  <span className="text-xs text-gray-400">/{activePage.slug}</span>
                </div>
                <div className="flex items-center gap-2">
                  {activePage.published && (
                    <Link
                      to={`/apps/${appId}/p/${activePage.slug}`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Open Full Page
                    </Link>
                  )}
                  <Link
                    to={`/apps/${appId}/pages/${activePage.id}/edit`}
                    className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900"
                  >
                    Edit Layout
                  </Link>
                  <button
                    onClick={() => handleDelete(activePage.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Rendered page content */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                {isLoadingView ? (
                  <div className="flex items-center justify-center py-16">
                    <p className="text-sm text-gray-400">Loading view...</p>
                  </div>
                ) : activeConfig ? (
                  <div className="min-h-[200px]">
                    <PageRenderer config={activeConfig} appId={appId!} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <p className="mb-3 text-sm text-gray-500">
                      This view is empty. Add components to build the layout.
                    </p>
                    <Link
                      to={`/apps/${appId}/pages/${activePage.id}/edit`}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Edit Layout
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
