import { useState, useEffect, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import {
  getApp,
  getType,
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  resolveRecords,
  type App,
  type AppType,
  type Field,
  type AppRecord,
} from '../api/apps-client';
import { FieldRenderer } from './field-renderers';
import { FieldInput } from './field-inputs';

export function RecordListPage() {
  const { appId, typeId } = useParams<{ appId: string; typeId: string }>();
  const { user } = useAuth();
  const [app, setApp] = useState<App | null>(null);
  const [type, setType] = useState<AppType | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Resolved relation display values: { recordId → displayValue }
  const [resolvedRelations, setResolvedRelations] = useState<Record<string, string>>({});

  // Add/edit record form
  const [showForm, setShowForm] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

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

  useEffect(() => {
    if (!appId || !typeId) return;
    listRecords(appId, typeId, page, pageSize)
      .then((res) => {
        setRecords(res.records);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message));
  }, [appId, typeId, page, pageSize]);

  // Resolve relation display values
  useEffect(() => {
    if (!appId || fields.length === 0 || records.length === 0) return;

    const relationFields = fields.filter((f) => f.type === 'relation');
    if (relationFields.length === 0) return;

    // Group relation IDs by their related type
    const idsByType: Record<string, Set<string>> = {};
    for (const field of relationFields) {
      const relatedTypeId = (field.config as { relatedTypeId?: string })?.relatedTypeId;
      if (!relatedTypeId) continue;
      if (!idsByType[relatedTypeId]) idsByType[relatedTypeId] = new Set();
      for (const rec of records) {
        const val = (rec.data as Record<string, unknown>)[field.id];
        if (typeof val === 'string' && val) {
          idsByType[relatedTypeId].add(val);
        }
      }
    }

    // Resolve each related type's records
    const entries = Object.entries(idsByType).filter(([, ids]) => ids.size > 0);
    if (entries.length === 0) return;

    Promise.all(
      entries.map(([relatedTypeId, ids]) =>
        resolveRecords(appId, relatedTypeId, [...ids])
      )
    ).then((results) => {
      const merged: Record<string, string> = {};
      for (const res of results) {
        for (const [id, data] of Object.entries(res.records)) {
          merged[id] = data.displayValue;
        }
      }
      setResolvedRelations(merged);
    }).catch(() => {});
  }, [appId, fields, records]);

  const openAddForm = () => {
    setEditingRecordId(null);
    const defaults: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === 'boolean') defaults[f.id] = false;
      else if (f.type === 'multi_select') defaults[f.id] = [];
      else defaults[f.id] = null;
    }
    setFormData(defaults);
    setShowForm(true);
  };

  const openEditForm = (record: AppRecord) => {
    setEditingRecordId(record.id);
    const data: Record<string, unknown> = {};
    for (const f of fields) {
      data[f.id] = (record.data as Record<string, unknown>)[f.id] ?? null;
    }
    setFormData(data);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!appId || !typeId) return;
    setError('');
    try {
      if (editingRecordId) {
        const res = await updateRecord(appId, typeId, editingRecordId, formData);
        setRecords((prev) =>
          prev.map((r) => (r.id === editingRecordId ? res.record : r))
        );
      } else {
        const res = await createRecord(appId, typeId, formData);
        setRecords((prev) => [res.record, ...prev]);
        setTotal((prev) => prev + 1);
      }
      setShowForm(false);
      setEditingRecordId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save record');
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!appId || !typeId) return;
    try {
      await deleteRecord(appId, typeId, recordId);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete record');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

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
        {/* Data / Build tabs */}
        <div className="mb-6 flex items-center gap-4 border-b border-gray-200">
          <button className="border-b-2 border-blue-600 px-3 pb-2 text-sm font-medium text-blue-600">
            Data
          </button>
          <Link
            to={`/apps/${appId}/types/${typeId}/build`}
            className="border-b-2 border-transparent px-3 pb-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Build
          </Link>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Records</h2>
            <p className="mt-1 text-sm text-gray-500">
              {total} record{total !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={openAddForm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Record
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Add/Edit Record Form */}
        {showForm && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-medium text-gray-900">
              {editingRecordId ? 'Edit Record' : 'New Record'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {fields.map((field) => (
                <div key={field.id}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {field.name}
                    {field.required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <FieldInput
                    field={field}
                    value={formData[field.id]}
                    onChange={(val) =>
                      setFormData((prev) => ({ ...prev, [field.id]: val }))
                    }
                    appId={appId}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {editingRecordId ? 'Save' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingRecordId(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Records Table */}
        {fields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">
              No fields defined yet.{' '}
              <Link
                to={`/apps/${appId}/types/${typeId}/build`}
                className="text-blue-600 hover:underline"
              >
                Add fields
              </Link>{' '}
              to start creating records.
            </p>
          </div>
        ) : records.length === 0 && !showForm ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
            <p className="text-gray-500">No records yet. Add your first record to get started.</p>
          </div>
        ) : records.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-sm text-gray-500">
                    {fields.map((field) => (
                      <th key={field.id} className="px-4 py-3 font-medium">
                        {field.name}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-gray-50 last:border-0"
                    >
                      {fields.map((field) => (
                        <td key={field.id} className="px-4 py-3">
                          <FieldRenderer
                            value={(record.data as Record<string, unknown>)[field.id]}
                            fieldType={field.type}
                            resolvedRelations={resolvedRelations}
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditForm(record)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                            title="Delete"
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
