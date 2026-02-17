import { useState, useEffect } from 'react';
import { Outlet, useParams, useLocation, Link } from 'react-router';
import { getType, updateType, type AppType } from '../api/apps-client';
import { useWorkspace } from './AppWorkspace';
import { EmojiPicker } from './EmojiPicker';

export function TypeView() {
  const { appId, typeId } = useParams<{ appId: string; typeId: string }>();
  const location = useLocation();
  const { refreshTypes } = useWorkspace();

  const [type, setType] = useState<AppType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Inline name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  const [editIcon, setEditIcon] = useState('📋');

  useEffect(() => {
    if (!appId || !typeId) return;
    setIsLoading(true);
    getType(appId, typeId)
      .then((res) => {
        setType(res.type);
        setEditName(res.type.name);
        setEditIcon(res.type.icon || '📋');
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [appId, typeId]);

  const handleSaveName = async () => {
    if (!appId || !typeId || !editName.trim()) return;
    try {
      const res = await updateType(appId, typeId, { name: editName.trim() });
      setType(res.type);
      setIsEditingName(false);
      refreshTypes();
    } catch {
      setEditName(type?.name ?? '');
      setIsEditingName(false);
    }
  };

  const handleIconChange = async (emoji: string) => {
    setEditIcon(emoji);
    if (!appId || !typeId) return;
    try {
      const res = await updateType(appId, typeId, { icon: emoji });
      setType(res.type);
      refreshTypes();
    } catch {
      setEditIcon(type?.icon || '📋');
    }
  };

  // Determine active tab from URL
  const basePath = `/apps/${appId}/t/${typeId}`;
  const isFieldsTab = location.pathname.startsWith(`${basePath}/fields`);
  const isViewsTab = location.pathname.startsWith(`${basePath}/views`);
  const isDataTab = !isFieldsTab && !isViewsTab;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!type) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">Table not found</p>
      </div>
    );
  }

  const tabClass = (active: boolean) =>
    `border-b-2 px-4 pb-2 text-sm font-medium ${
      active
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Type header + tabs */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <EmojiPicker value={editIcon} onChange={handleIconChange} size="md" />
          {isEditingName ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') {
                  setEditName(type.name);
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
              title="Click to rename"
            >
              {type.name}
            </button>
          )}
        </div>

        <div className="flex gap-4">
          <Link to={basePath} className={tabClass(isDataTab)}>
            Data
          </Link>
          <Link to={`${basePath}/fields`} className={tabClass(isFieldsTab)}>
            Fields
          </Link>
          <Link to={`${basePath}/views`} className={tabClass(isViewsTab)}>
            Views
          </Link>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}
