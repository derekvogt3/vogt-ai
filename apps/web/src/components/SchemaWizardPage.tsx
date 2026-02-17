import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useWorkspace } from './AppWorkspace';
import {
  generateSchema,
  executeSchema,
  type SchemaProposal,
  type SchemaTypeProposal,
} from '../api/ai-client';

type Phase = 'prompt' | 'generating' | 'preview' | 'executing' | 'error';

const FIELD_TYPE_BADGES: Record<string, string> = {
  text: 'text',
  rich_text: 'rich text',
  number: 'number',
  boolean: 'bool',
  date: 'date',
  select: 'select',
  multi_select: 'multi-select',
  url: 'url',
  email: 'email',
  relation: 'relation',
};

export function SchemaWizardPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { refreshTypes } = useWorkspace();

  const [phase, setPhase] = useState<Phase>('prompt');
  const [prompt, setPrompt] = useState('');
  const [schema, setSchema] = useState<SchemaProposal | null>(null);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!appId || !prompt.trim()) return;
    setError('');
    setPhase('generating');

    try {
      const result = await generateSchema(appId, prompt.trim());
      setSchema(result);
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schema');
      setPhase('error');
    }
  };

  const handleExecute = async () => {
    if (!appId || !schema) return;
    setPhase('executing');
    setError('');

    try {
      const result = await executeSchema(appId, schema);
      refreshTypes();

      // Navigate to the first created type
      if (result.types.length > 0) {
        navigate(`/apps/${appId}/t/${result.types[0].id}`, { replace: true });
      } else {
        navigate(`/apps/${appId}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schema');
      setPhase('error');
    }
  };

  const handleRegenerate = () => {
    setPhase('prompt');
    setError('');
  };

  const handleCancel = () => {
    navigate(`/apps/${appId}`, { replace: true });
  };

  // Edit helpers
  const updateType = (index: number, updates: Partial<SchemaTypeProposal>) => {
    if (!schema) return;
    setSchema({
      types: schema.types.map((t, i) => (i === index ? { ...t, ...updates } : t)),
    });
  };

  const removeType = (index: number) => {
    if (!schema) return;
    setSchema({ types: schema.types.filter((_, i) => i !== index) });
  };

  const removeField = (typeIndex: number, fieldIndex: number) => {
    if (!schema) return;
    setSchema({
      types: schema.types.map((t, i) =>
        i === typeIndex
          ? { ...t, fields: t.fields.filter((_, fi) => fi !== fieldIndex) }
          : t,
      ),
    });
  };

  // ---- Prompt Step ----
  if (phase === 'prompt') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-full max-w-lg text-center">
          <div className="mb-2 text-4xl">✨</div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Build Your Schema</h1>
          <p className="mb-6 text-sm text-gray-500">
            Describe the data model you need and AI will design it for you.
          </p>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g., Build a CRM with Contacts, Companies, and Deals'
            rows={4}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleGenerate();
              }
            }}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              Generate Schema
            </button>
          </div>
          <p className="mt-3 text-[10px] text-gray-400">⌘+Enter to generate</p>
        </div>
      </div>
    );
  }

  // ---- Generating Step ----
  if (phase === 'generating') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-gray-300 border-t-purple-600" />
          <p className="mt-4 text-sm text-gray-500">AI is designing your schema...</p>
        </div>
      </div>
    );
  }

  // ---- Error Step ----
  if (phase === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-full max-w-md text-center">
          <div className="mb-4 text-4xl">⚠️</div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Something went wrong</h2>
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Executing Step ----
  if (phase === 'executing') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-gray-300 border-t-purple-600" />
          <p className="mt-4 text-sm text-gray-500">Creating types and fields...</p>
        </div>
      </div>
    );
  }

  // ---- Preview Step ----
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Schema Preview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review and edit the proposed schema before creating it.
        </p>
      </div>

      {schema && schema.types.length === 0 && (
        <div className="mb-6 rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm text-gray-500">No types in schema</p>
        </div>
      )}

      {schema && (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {schema.types.map((type, typeIndex) => (
            <div
              key={typeIndex}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              {/* Type header */}
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{type.icon}</span>
                  <input
                    type="text"
                    value={type.name}
                    onChange={(e) =>
                      updateType(typeIndex, { name: e.target.value })
                    }
                    className="border-b border-transparent text-sm font-semibold text-gray-900 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeType(typeIndex)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  title="Remove type"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* Description */}
              <input
                type="text"
                value={type.description}
                onChange={(e) =>
                  updateType(typeIndex, { description: e.target.value })
                }
                placeholder="Description..."
                className="mb-3 w-full border-b border-transparent text-xs text-gray-500 focus:border-purple-500 focus:outline-none"
              />

              {/* Fields list */}
              <div className="space-y-1">
                {type.fields.map((field, fieldIndex) => (
                  <div
                    key={fieldIndex}
                    className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50"
                  >
                    <span className="flex-1 truncate text-xs text-gray-700">
                      {field.name}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">
                      {FIELD_TYPE_BADGES[field.type] ?? field.type}
                    </span>
                    {field.required && (
                      <span className="text-[9px] text-red-400">req</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeField(typeIndex, fieldIndex)}
                      className="text-gray-300 hover:text-red-500"
                      title="Remove field"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
                {type.fields.length === 0 && (
                  <p className="px-2 py-1 text-[10px] text-gray-400">No fields</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex items-center justify-center gap-3 border-t border-gray-100 pt-6">
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRegenerate}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ↻ Regenerate
        </button>
        <button
          type="button"
          onClick={handleExecute}
          disabled={!schema || schema.types.length === 0}
          className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          Create All
        </button>
      </div>
    </div>
  );
}
