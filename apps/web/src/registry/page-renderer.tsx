import { useState, useEffect, useCallback } from 'react';
import {
  getType,
  listRecords,
  createRecord as apiCreateRecord,
  updateRecord as apiUpdateRecord,
  deleteRecord as apiDeleteRecord,
  resolveRecords,
  type Field,
  type AppRecord,
} from '../api/apps-client';
import { getRegistryEntry } from './index';
import type { ComponentNode, PageConfig, DataBinding, DataContext } from './types';

// --- PageRenderer (entry point) ---

type PageRendererProps = {
  config: PageConfig;
  appId: string;
};

export function PageRenderer({ config, appId }: PageRendererProps) {
  if (!config?.root) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        Empty page configuration
      </div>
    );
  }

  return <NodeRenderer node={config.root} appId={appId} />;
}

// --- NodeRenderer (recursive) ---

type NodeRendererProps = {
  node: ComponentNode;
  appId: string;
};

function NodeRenderer({ node, appId }: NodeRendererProps) {
  const entry = getRegistryEntry(node.type);

  if (!entry) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600">
        Unknown component: {node.type}
      </div>
    );
  }

  const Component = entry.component;

  // Render children recursively
  const children = node.children?.map((child) => (
    <NodeRenderer key={child.id} node={child} appId={appId} />
  ));

  // If data-bound, wrap in DataProvider
  if (node.dataBinding) {
    return (
      <DataProvider binding={node.dataBinding} appId={appId}>
        {(data) => (
          <Component node={node} data={data} appId={appId}>
            {children}
          </Component>
        )}
      </DataProvider>
    );
  }

  return (
    <Component node={node} appId={appId}>
      {children}
    </Component>
  );
}

// --- DataProvider ---

type DataProviderProps = {
  binding: DataBinding;
  appId: string;
  children: (data: DataContext) => React.ReactNode;
};

function DataProvider({ binding, appId, children }: DataProviderProps) {
  const [fields, setFields] = useState<Field[]>([]);
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(binding.limit ?? 50);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedRelations, setResolvedRelations] = useState<Record<string, string>>({});

  // Fetch type fields
  useEffect(() => {
    getType(appId, binding.typeId)
      .then((res) => setFields(res.fields))
      .catch((err) => setError(err.message));
  }, [appId, binding.typeId]);

  // Fetch records
  const fetchRecords = useCallback(() => {
    setIsLoading(true);
    listRecords(appId, binding.typeId, page, pageSize)
      .then((res) => {
        setRecords(res.records);
        setTotal(res.total);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [appId, binding.typeId, page, pageSize]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Resolve relation display values
  useEffect(() => {
    if (fields.length === 0 || records.length === 0) return;

    const relationFields = fields.filter((f) => f.type === 'relation');
    if (relationFields.length === 0) return;

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

    const entries = Object.entries(idsByType).filter(([, ids]) => ids.size > 0);
    if (entries.length === 0) return;

    Promise.all(
      entries.map(([relatedTypeId, ids]) =>
        resolveRecords(appId, relatedTypeId, [...ids])
      )
    )
      .then((results) => {
        const merged: Record<string, string> = {};
        for (const res of results) {
          for (const [id, data] of Object.entries(res.records)) {
            merged[id] = data.displayValue;
          }
        }
        setResolvedRelations(merged);
      })
      .catch(() => {});
  }, [appId, fields, records]);

  // CRUD operations that refresh data after mutation
  const createRecord = useCallback(
    async (data: Record<string, unknown>) => {
      await apiCreateRecord(appId, binding.typeId, data);
      fetchRecords();
    },
    [appId, binding.typeId, fetchRecords]
  );

  const updateRecord = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      await apiUpdateRecord(appId, binding.typeId, id, data);
      fetchRecords();
    },
    [appId, binding.typeId, fetchRecords]
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      await apiDeleteRecord(appId, binding.typeId, id);
      fetchRecords();
    },
    [appId, binding.typeId, fetchRecords]
  );

  const dataContext: DataContext = {
    records,
    fields,
    total,
    page,
    pageSize,
    isLoading,
    error,
    createRecord,
    updateRecord,
    deleteRecord,
    setPage,
    resolvedRelations,
  };

  return <>{children(dataContext)}</>;
}
