import { useState, type FormEvent } from 'react';
import type { RegistryComponentProps } from '../types';
import { FieldInput } from '../../components/field-inputs';

export function RecordForm({ node, data, appId }: RegistryComponentProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [formError, setFormError] = useState('');

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400">
        RecordForm requires a data binding
      </div>
    );
  }

  const { fields, createRecord, isLoading, error } = data;

  // Filter to only show fields specified in props (or all fields if none specified)
  const fieldIds = (node.props.fields as string[] | undefined) ?? fields.map((f) => f.id);
  const visibleFields = fields.filter((f) => fieldIds.includes(f.id));

  const title = (node.props.title as string) ?? 'New Record';
  const submitLabel = (node.props.submitLabel as string) ?? 'Submit';
  const showTitle = (node.props.showTitle as boolean) !== false;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await createRecord(formData);
      setSuccess('Record created successfully');
      // Reset form
      const defaults: Record<string, unknown> = {};
      for (const f of visibleFields) {
        if (f.type === 'boolean') defaults[f.id] = false;
        else if (f.type === 'multi_select') defaults[f.id] = [];
        else defaults[f.id] = null;
      }
      setFormData(defaults);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create record');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-400">Loading form...</p>
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
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {showTitle && (
        <h3 className="mb-4 text-lg font-medium text-gray-900">{title}</h3>
      )}

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600">
          {success}
        </div>
      )}

      {formError && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {visibleFields.map((field) => (
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

        {visibleFields.length === 0 ? (
          <p className="text-sm text-gray-400">No fields configured for this form</p>
        ) : (
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : submitLabel}
          </button>
        )}
      </form>
    </div>
  );
}
