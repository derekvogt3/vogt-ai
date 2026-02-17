import type { FieldType } from '../api/apps-client';

type FieldRendererProps = {
  value: unknown;
  fieldType: FieldType;
  resolvedRelations?: Record<string, string>;
};

export function FieldRenderer({ value, fieldType, resolvedRelations }: FieldRendererProps) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-300">—</span>;
  }

  switch (fieldType) {
    case 'boolean':
      return (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {value ? 'Yes' : 'No'}
        </span>
      );

    case 'date':
      return (
        <span className="text-sm text-gray-900">
          {new Date(value as string).toLocaleDateString()}
        </span>
      );

    case 'url':
      return (
        <a
          href={value as string}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          {value as string}
        </a>
      );

    case 'email':
      return (
        <a href={`mailto:${value}`} className="text-sm text-blue-600 hover:underline">
          {value as string}
        </a>
      );

    case 'select':
      return (
        <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          {value as string}
        </span>
      );

    case 'multi_select':
      return (
        <div className="flex flex-wrap gap-1">
          {(value as string[]).map((item, i) => (
            <span
              key={i}
              className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
            >
              {item}
            </span>
          ))}
        </div>
      );

    case 'number':
      return <span className="text-sm text-gray-900">{String(value)}</span>;

    case 'relation': {
      const display = resolvedRelations?.[value as string];
      return display ? (
        <span className="inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
          {display}
        </span>
      ) : (
        <span className="text-xs text-gray-400 italic">Deleted record</span>
      );
    }

    default:
      return <span className="text-sm text-gray-900">{String(value)}</span>;
  }
}
