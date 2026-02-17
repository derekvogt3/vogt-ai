import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import {
  getApp,
  getPage,
  getType,
  updatePage,
  type App,
  type AppType,
  type Field,
} from '../api/apps-client';
import { registry, getRegistryEntries } from '../registry';
import { PageRenderer } from '../registry/page-renderer';
import type { ComponentNode, PageConfig, DataBinding, PropDef } from '../registry/types';

function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultPropsForType(type: string): Record<string, unknown> {
  const entry = registry[type];
  if (!entry) return {};
  const props: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(entry.propsSchema)) {
    if (def.default !== undefined) {
      props[key] = def.default;
    }
  }
  return props;
}

function createNode(type: string): ComponentNode {
  const entry = registry[type];
  const node: ComponentNode = {
    id: generateId(),
    type,
    props: defaultPropsForType(type),
  };
  if (entry?.acceptsChildren) {
    node.children = [];
  }
  return node;
}

// --- Tree manipulation helpers ---

function findNode(root: ComponentNode, id: string): ComponentNode | null {
  if (root.id === id) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

function removeNode(root: ComponentNode, id: string): ComponentNode {
  if (root.id === id) return root; // can't remove root
  return {
    ...root,
    children: root.children
      ?.filter((c) => c.id !== id)
      .map((c) => removeNode(c, id)),
  };
}

function updateNodeInTree(root: ComponentNode, id: string, updater: (n: ComponentNode) => ComponentNode): ComponentNode {
  if (root.id === id) return updater(root);
  return {
    ...root,
    children: root.children?.map((c) => updateNodeInTree(c, id, updater)),
  };
}

function addChildToNode(root: ComponentNode, parentId: string, child: ComponentNode): ComponentNode {
  return updateNodeInTree(root, parentId, (parent) => ({
    ...parent,
    children: [...(parent.children ?? []), child],
  }));
}

// --- Component Tree UI ---

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  onDelete,
}: {
  node: ComponentNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const entry = registry[node.type];
  const isSelected = selectedId === node.id;
  const isRoot = node.id === 'root';

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-2 py-1 text-sm cursor-pointer ${
          isSelected ? 'bg-blue-100 text-blue-800' : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        <span className="flex-1 truncate">
          {entry?.label ?? node.type}
          {node.props.text ? `: "${String(node.props.text).slice(0, 20)}"` : ''}
          {node.props.title ? `: "${String(node.props.title).slice(0, 20)}"` : ''}
        </span>
        {!isRoot && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            className="hidden group-hover:block rounded p-0.5 text-gray-400 hover:text-red-500"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
      {node.children?.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// --- Props Editor ---

function PropsEditor({
  node,
  onUpdate,
  appTypes,
  appId,
}: {
  node: ComponentNode;
  onUpdate: (updater: (n: ComponentNode) => ComponentNode) => void;
  appTypes: AppType[];
  appId: string;
}) {
  const entry = registry[node.type];
  if (!entry) return null;

  const [typeFields, setTypeFields] = useState<Field[]>([]);

  // Fetch fields when a data binding type is selected
  const boundTypeId = node.dataBinding?.typeId;
  useEffect(() => {
    if (!boundTypeId || !appId) {
      setTypeFields([]);
      return;
    }
    getType(appId, boundTypeId)
      .then((res) => setTypeFields(res.fields))
      .catch(() => setTypeFields([]));
  }, [appId, boundTypeId]);

  const updateProp = (key: string, value: unknown) => {
    onUpdate((n) => ({
      ...n,
      props: { ...n.props, [key]: value },
    }));
  };

  const updateBinding = (binding: DataBinding | undefined) => {
    onUpdate((n) => {
      const updated = { ...n };
      if (binding) {
        updated.dataBinding = binding;
      } else {
        delete updated.dataBinding;
      }
      return updated;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {entry.label} Properties
        </h4>
      </div>

      {/* Props form */}
      {Object.entries(entry.propsSchema).map(([key, def]) => (
        <PropField
          key={key}
          propKey={key}
          def={def}
          value={node.props[key]}
          onChange={(val) => updateProp(key, val)}
          typeFields={typeFields}
        />
      ))}

      {/* Data binding config */}
      {entry.acceptsDataBinding && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Data Binding
          </h4>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select
                value={node.dataBinding?.typeId ?? ''}
                onChange={(e) => {
                  const typeId = e.target.value;
                  if (typeId) {
                    updateBinding({ ...node.dataBinding, typeId });
                  } else {
                    updateBinding(undefined);
                  }
                }}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                {appTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.icon || '📋'} {t.name}
                  </option>
                ))}
              </select>
            </div>
            {node.dataBinding?.typeId && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Limit</label>
                <input
                  type="number"
                  value={node.dataBinding.limit ?? ''}
                  onChange={(e) => {
                    const limit = e.target.value ? Number(e.target.value) : undefined;
                    updateBinding({ ...node.dataBinding!, limit });
                  }}
                  placeholder="50"
                  min={1}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PropField({
  propKey,
  def,
  value,
  onChange,
  typeFields,
}: {
  propKey: string;
  def: PropDef;
  value: unknown;
  onChange: (val: unknown) => void;
  typeFields: Field[];
}) {
  const label = propKey.charAt(0).toUpperCase() + propKey.slice(1).replace(/([A-Z])/g, ' $1');

  switch (def.type) {
    case 'string':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            placeholder={def.description}
          />
        </div>
      );

    case 'number':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
          <input
            type="number"
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value ?? def.default)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-xs font-medium text-gray-600">{label}</span>
        </label>
      );

    case 'enum':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
          <select
            value={(value as string) ?? (def.default as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {def.enumValues?.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      );

    case 'fieldId[]':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
          {typeFields.length === 0 ? (
            <p className="text-xs text-gray-400">Bind a type first to select fields</p>
          ) : (
            <div className="space-y-1">
              {typeFields.map((f) => {
                const selected = (value as string[]) ?? [];
                const isChecked = selected.length === 0 || selected.includes(f.id);
                return (
                  <label key={f.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (selected.length === 0) {
                          // First explicit selection: include all except this one if unchecking
                          if (!e.target.checked) {
                            onChange(typeFields.filter((tf) => tf.id !== f.id).map((tf) => tf.id));
                          }
                        } else {
                          if (e.target.checked) {
                            const newVal = [...selected, f.id];
                            // If all are selected, clear the array (means "all")
                            if (newVal.length === typeFields.length) {
                              onChange([]);
                            } else {
                              onChange(newVal);
                            }
                          } else {
                            onChange(selected.filter((id) => id !== f.id));
                          }
                        }
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">{f.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      );

    case 'fieldId':
    case 'typeId':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
          <select
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {typeFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      );

    default:
      return null;
  }
}

// --- Main Page Builder ---

export function PageBuilderPage() {
  const { appId, pageId } = useParams<{ appId: string; pageId: string }>();
  const navigate = useNavigate();

  const [app, setApp] = useState<App | null>(null);
  const [appTypes, setAppTypes] = useState<AppType[]>([]);
  const [pageName, setPageName] = useState('');
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [published, setPublished] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('root');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isPreview, setIsPreview] = useState(false);

  // Load app and page
  useEffect(() => {
    if (!appId || !pageId) return;
    Promise.all([getApp(appId), getPage(appId, pageId)])
      .then(([appRes, pageRes]) => {
        setApp(appRes.app);
        setAppTypes(appRes.types);
        setPageName(pageRes.page.name);
        setConfig(pageRes.page.config as unknown as PageConfig);
        setPublished(pageRes.page.published);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [appId, pageId]);

  const selectedNode = config ? findNode(config.root, selectedNodeId ?? '') : null;

  const handleAddComponent = useCallback(
    (type: string) => {
      if (!config) return;
      const newNode = createNode(type);
      const parentId = selectedNodeId ?? 'root';

      // Find a valid parent (must accept children)
      let targetParent = findNode(config.root, parentId);
      if (targetParent && !registry[targetParent.type]?.acceptsChildren) {
        targetParent = config.root; // fall back to root
      }

      setConfig({
        root: addChildToNode(config.root, targetParent?.id ?? 'root', newNode),
      });
      setSelectedNodeId(newNode.id);
    },
    [config, selectedNodeId]
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      if (!config || id === 'root') return;
      setConfig({ root: removeNode(config.root, id) });
      if (selectedNodeId === id) {
        setSelectedNodeId('root');
      }
    },
    [config, selectedNodeId]
  );

  const handleUpdateNode = useCallback(
    (updater: (n: ComponentNode) => ComponentNode) => {
      if (!config || !selectedNodeId) return;
      setConfig({
        root: updateNodeInTree(config.root, selectedNodeId, updater),
      });
    },
    [config, selectedNodeId]
  );

  const handleSave = async () => {
    if (!appId || !pageId || !config) return;
    setIsSaving(true);
    setSaveMessage('');
    setError('');
    try {
      await updatePage(appId, pageId, { config: config as unknown as Record<string, unknown>, published });
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!appId || !pageId || !config) return;
    const newPublished = !published;
    setIsSaving(true);
    setError('');
    try {
      await updatePage(appId, pageId, { published: newPublished });
      setPublished(newPublished);
      setSaveMessage(newPublished ? 'Published' : 'Unpublished');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!app || !config) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Page not found</p>
      </div>
    );
  }

  // Preview mode — full-width renderer
  if (isPreview) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white px-4 py-2">
          <button
            onClick={() => setIsPreview(false)}
            className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
          >
            ← Exit Preview
          </button>
        </div>
        <PageRenderer config={config} appId={appId!} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Top toolbar */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            to={`/apps/${appId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </Link>
          <span className="text-gray-300">|</span>
          <input
            type="text"
            value={pageName}
            onChange={(e) => setPageName(e.target.value)}
            className="border-0 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0"
          />
        </div>

        <div className="flex items-center gap-2">
          {saveMessage && (
            <span className="text-xs text-green-600">{saveMessage}</span>
          )}
          {error && (
            <span className="text-xs text-red-600">{error}</span>
          )}
          <button
            onClick={() => setIsPreview(true)}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Preview
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleTogglePublish}
            disabled={isSaving}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              published
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {published ? '● Published' : 'Publish'}
          </button>
        </div>
      </header>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — component tree */}
        <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="relative">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddComponent(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full rounded bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700"
                defaultValue=""
              >
                <option value="" disabled>
                  + Add Component
                </option>
                {getRegistryEntries().map(([key, entry]) => (
                  <option key={key} value={key}>
                    {entry.label} ({entry.category})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="py-1">
            <TreeNode
              node={config.root}
              depth={0}
              selectedId={selectedNodeId}
              onSelect={setSelectedNodeId}
              onDelete={handleDeleteNode}
            />
          </div>
        </div>

        {/* Center panel — live preview */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
          <div className="mx-auto min-h-full rounded-lg bg-white shadow-sm">
            <PageRenderer config={config} appId={appId!} />
          </div>
        </div>

        {/* Right panel — properties editor */}
        <div className="w-64 flex-shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4">
          {selectedNode ? (
            <PropsEditor
              key={selectedNodeId}
              node={selectedNode}
              onUpdate={handleUpdateNode}
              appTypes={appTypes}
              appId={appId!}
            />
          ) : (
            <p className="text-sm text-gray-400">Select a component to edit its properties</p>
          )}
        </div>
      </div>
    </div>
  );
}
