import type { RegistryComponentProps } from '../types';
import { FieldRenderer } from '../../components/field-renderers';

export function DataTable({ node, data }: RegistryComponentProps) {
  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400">
        DataTable requires a data binding
      </div>
    );
  }

  const { records, fields, total, page, pageSize, isLoading, error, setPage, resolvedRelations } = data;

  // Filter to only show columns specified in props (or all fields if none specified)
  const columnFieldIds = (node.props.columns as string[] | undefined) ?? fields.map((f) => f.id);
  const visibleFields = fields.filter((f) => columnFieldIds.includes(f.id));

  const totalPages = Math.ceil(total / pageSize);
  const showPagination = (node.props.showPagination as boolean) !== false && totalPages > 1;
  const title = node.props.title as string | undefined;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-400">Loading records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div>
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="text-sm text-gray-500">
            {total} record{total !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {visibleFields.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400">
          No fields to display
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
          No records found
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-sm text-gray-500">
                {visibleFields.map((field) => (
                  <th key={field.id} className="px-4 py-3 font-medium">
                    {field.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-gray-50 last:border-0">
                  {visibleFields.map((field) => (
                    <td key={field.id} className="px-4 py-3">
                      <FieldRenderer
                        value={(record.data as Record<string, unknown>)[field.id]}
                        fieldType={field.type}
                        resolvedRelations={resolvedRelations}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPagination && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
