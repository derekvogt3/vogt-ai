import { useState, useEffect } from 'react';
import { listRecords, resolveRecords, type Field, type FieldType, type AppRecord } from '../api/apps-client';

type FieldInputProps = {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  appId?: string;
};

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

function RelationInput({ field, value, onChange, appId }: FieldInputProps & { appId: string }) {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const relatedTypeId = (field.config as { relatedTypeId?: string })?.relatedTypeId;

  useEffect(() => {
    if (!relatedTypeId || !appId) {
      setLoading(false);
      return;
    }
    listRecords(appId, relatedTypeId, 1, 100)
      .then(async (res) => {
        if (res.records.length === 0) {
          setOptions([]);
          return;
        }
        const ids = res.records.map((r) => r.id);
        const resolved = await resolveRecords(appId, relatedTypeId, ids);
        setOptions(
          res.records.map((r) => ({
            id: r.id,
            label: resolved.records[r.id]?.displayValue ?? r.id,
          }))
        );
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [appId, relatedTypeId]);

  if (loading) {
    return <span className="text-xs text-gray-400">Loading...</span>;
  }

  return (
    <select
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={inputClass}
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function FieldInput({ field, value, onChange, appId }: FieldInputProps) {
  switch (field.type) {
    case 'text':
    case 'rich_text':
      return field.type === 'rich_text' ? (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder={field.name}
        />
      ) : (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          placeholder={field.name}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value !== null && value !== undefined ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={inputClass}
          placeholder={field.name}
        />
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">{field.name}</span>
        </label>
      );

    case 'date':
      return (
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClass}
        />
      );

    case 'select': {
      const options = ((field.config as { options?: string[] })?.options) ?? [];
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClass}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    case 'multi_select': {
      const options = ((field.config as { options?: string[] })?.options) ?? [];
      const selected = (value as string[]) ?? [];
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selected, opt]);
                  } else {
                    onChange(selected.filter((s) => s !== opt));
                  }
                }}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
          {options.length === 0 && (
            <span className="text-xs text-gray-400">No options configured</span>
          )}
        </div>
      );
    }

    case 'url':
      return (
        <input
          type="url"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClass}
          placeholder="https://..."
        />
      );

    case 'email':
      return (
        <input
          type="email"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClass}
          placeholder="name@example.com"
        />
      );

    case 'relation':
      return appId ? (
        <RelationInput field={field} value={value} onChange={onChange} appId={appId} />
      ) : (
        <span className="text-xs text-gray-400">Project context required</span>
      );

    default:
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          placeholder={field.name}
        />
      );
  }
}
