import { useState, useEffect, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import {
  getApp,
  getType,
  createField,
  updateField,
  deleteField,
  reorderFields,
  type App,
  type AppType,
  type Field,
  type FieldType,
} from '../api/apps-client';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'rich_text', label: 'Rich Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
];

export function TypeBuilderPage() {
  const { appId, typeId } = useParams<{ appId: string; typeId: string }>();
  const { user } = useAuth();
  const [app, setApp] = useState<App | null>(null);
  const [type, setType] = useState<AppType | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Add field form
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  // Editing field
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldName, setEditFieldName] = useState('');

  useEffect(() => {
    if (!appId || !typeId) return;
    Promise.all([getApp(appId), getType(appId, typeId)])
      .then(([appRes, typeRes]) => {
        setApp(appRes.app);
        setType(typeRes.type);
        setFields(typeRes.fields);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [appId, typeId]);

  const handleAddField = async (e: FormEvent) => {
    e.preventDefault();
    if (!appId || !typeId) return;
    setError('');
    try {
      const res = await createField(appId, typeId, {
        name: newFieldName,
        type: newFieldType,
        required: newFieldRequired,
      });
      setFields((prev) => [...prev, res.field]);
      setNewFieldName('');
      setNewFieldType('text');
      setNewFieldRequired(false);
      setShowAddField(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add field');
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!appId || !typeId) return;
    try {
      await deleteField(appId, typeId, fieldId);
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete field');
    }
  };

  const handleSaveFieldName = async (fieldId: string) => {
    if (!appId || !typeId || !editFieldName.trim()) return;
    try {
      const res = await updateField(appId, typeId, fieldId, {
        name: editFieldName.trim(),
      });
      setFields((prev) =>
        prev.map((f) => (f.id === fieldId ? res.field : f))
      );
      setEditingFieldId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update field');
    }
  };

  const handleMoveField = async (index: number, direction: 'up' | 'down') => {
    if (!appId || !typeId) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;

    const reordered = [...fields];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setFields(reordered);

    try {
      await reorderFields(appId, typeId, reordered.map((f) => f.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder fields');
    }
  };

  const handleToggleRequired = async (field: Field) => {
    if (!appId || !typeId) return;
    try {
      const res = await updateField(appId, typeId, field.id, {
        required: !field.required,
      });
      setFields((prev) =>
        prev.map((f) => (f.id === field.id ? res.field : f))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update field');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!app || !type) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            <Link to="/" className="text-gray-500 hover:text-gray-700">
              Apps
            </Link>
            <span className="text-gray-300">/</span>
            <Link to={`/apps/${appId}`} className="text-gray-500 hover:text-gray-700">
              {app.icon || '📦'} {app.name}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-900">
              {type.icon || '📋'} {type.name}
            </span>
          </div>
          <span className="text-sm text-gray-500">{user?.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Fields</h2>
            <p className="mt-1 text-sm text-gray-500">
              Define the data structure for {type.name}
            </p>
          </div>
          <button
            onClick={() => setShowAddField(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Field
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Add Field Form */}
        {showAddField && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-medium text-gray-900">New Field</h3>
            <form onSubmit={handleAddField} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="field-name" className="mb-1 block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    id="field-name"
                    type="text"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    required
                    autoFocus
                    placeholder="e.g., Full Name, Status, Due Date"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="field-type" className="mb-1 block text-sm font-medium text-gray-700">
                    Type
                  </label>
                  <select
                    id="field-type"
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as FieldType)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>
                        {ft.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="field-required"
                  type="checkbox"
                  checked={newFieldRequired}
                  onChange={(e) => setNewFieldRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="field-required" className="text-sm text-gray-700">
                  Required
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddField(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Fields List */}
        {fields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">
              No fields yet. Add fields to define what data this type stores.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left text-sm text-gray-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Required</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr
                    key={field.id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-4 py-3">
                      {editingFieldId === field.id ? (
                        <input
                          type="text"
                          value={editFieldName}
                          onChange={(e) => setEditFieldName(e.target.value)}
                          onBlur={() => handleSaveFieldName(field.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveFieldName(field.id);
                            if (e.key === 'Escape') setEditingFieldId(null);
                          }}
                          autoFocus
                          className="rounded border border-blue-300 px-2 py-1 text-sm focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingFieldId(field.id);
                            setEditFieldName(field.name);
                          }}
                          className="text-sm font-medium text-gray-900 hover:text-blue-600"
                        >
                          {field.name}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {FIELD_TYPES.find((ft) => ft.value === field.type)?.label || field.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleRequired(field)}
                        className={`text-sm ${field.required ? 'font-medium text-blue-600' : 'text-gray-400'}`}
                      >
                        {field.required ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveField(index, 'up')}
                          disabled={index === 0}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                          title="Move up"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleMoveField(index, 'down')}
                          disabled={index === fields.length - 1}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                          title="Move down"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteField(field.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          title="Delete field"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
