import { useState } from 'react';
import {
  generateAutomation,
  type AutomationProposal,
} from '../api/ai-client';
import { createAutomation, type Automation } from '../api/apps-client';

type Phase = 'prompting' | 'generating' | 'preview';

const TRIGGER_OPTIONS = [
  { value: 'record_created', label: '📥 On Create' },
  { value: 'record_updated', label: '✏️ On Update' },
  { value: 'record_deleted', label: '🗑️ On Delete' },
  { value: 'manual', label: '▶️ Manual' },
] as const;

type AutomationBuilderProps = {
  appId: string;
  typeId: string;
  onCreated: (automation: Automation) => void;
  onCancel: () => void;
};

export function AutomationBuilder({
  appId,
  typeId,
  onCreated,
  onCancel,
}: AutomationBuilderProps) {
  const [phase, setPhase] = useState<Phase>('prompting');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Editable proposal fields
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<string>('record_created');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [explanation, setExplanation] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError('');
    setPhase('generating');

    try {
      const proposal = await generateAutomation(appId, prompt.trim(), typeId);
      setName(proposal.name);
      setTrigger(proposal.trigger);
      setDescription(proposal.description);
      setCode(proposal.code);
      setExplanation(proposal.explanation);
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate automation');
      setPhase('prompting');
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) return;
    setIsSaving(true);
    setError('');

    try {
      const res = await createAutomation(appId, {
        name: name.trim(),
        typeId,
        trigger,
        code,
        description: description.trim() || undefined,
      });
      onCreated(res.automation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save automation');
      setIsSaving(false);
    }
  };

  const handleRegenerate = () => {
    setPhase('prompting');
    setError('');
  };

  return (
    <div className="mb-6 rounded-xl border border-purple-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-lg">✨</span>
        <h3 className="text-sm font-semibold text-gray-900">
          New Automation
        </h3>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Phase 1: Prompt input */}
      {phase === 'prompting' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Describe what this automation should do
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., When a record is created, log the email field and check for duplicates"
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleGenerate();
              }
              if (e.key === 'Escape') onCancel();
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">⌘+Enter to generate</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2: Generating */}
      {phase === 'generating' && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-purple-600" />
          <span className="text-sm text-gray-500">AI is generating your automation...</span>
        </div>
      )}

      {/* Phase 3: Preview & Edit */}
      {phase === 'preview' && (
        <div className="space-y-4">
          {/* AI Explanation */}
          {explanation && (
            <div className="rounded-lg bg-purple-50 px-4 py-3 text-xs text-purple-700">
              <span className="font-medium">AI: </span>
              {explanation}
            </div>
          )}

          {/* Name + Trigger row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Trigger
              </label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {TRIGGER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Code */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Python Code
            </label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full rounded-lg bg-gray-900 px-4 py-3 font-mono text-xs text-green-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              ↻ Regenerate
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !name.trim() || !code.trim()}
              className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Automation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
