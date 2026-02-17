import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { useWorkspace } from './AppWorkspace';
import { AutomationBuilder } from './AutomationBuilder';
import {
  listAutomations,
  updateAutomation,
  deleteAutomation,
  runAutomationManually,
  listAutomationRuns,
  type Automation,
  type AutomationRun,
} from '../api/apps-client';

const TRIGGER_LABELS: Record<string, string> = {
  record_created: '📥 On Create',
  record_updated: '✏️ On Update',
  record_deleted: '🗑️ On Delete',
  manual: '▶️ Manual',
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  success: { label: '✓ Success', className: 'bg-green-100 text-green-700' },
  error: { label: '✗ Error', className: 'bg-red-100 text-red-700' },
  timeout: { label: '⏱ Timeout', className: 'bg-yellow-100 text-yellow-700' },
  running: { label: '⟳ Running', className: 'bg-blue-100 text-blue-700' },
};

export function AutomationsTab() {
  const { appId, typeId } = useParams<{ appId: string; typeId: string }>();
  const { refreshKey } = useWorkspace();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Expanded automation (show details + runs)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // Run-in-progress tracking
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  // Builder panel
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    if (!appId || !typeId) return;
    setIsLoading(true);
    listAutomations(appId, typeId)
      .then((res) => setAutomations(res.automations))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load automations'))
      .finally(() => setIsLoading(false));
  }, [appId, typeId, refreshKey]);

  const handleToggleEnabled = async (automation: Automation) => {
    if (!appId) return;
    try {
      const res = await updateAutomation(appId, automation.id, {
        enabled: !automation.enabled,
      });
      setAutomations((prev) =>
        prev.map((a) => (a.id === automation.id ? res.automation : a)),
      );
    } catch {
      // ignore
    }
  };

  const handleDelete = async (automationId: string) => {
    if (!appId) return;
    try {
      await deleteAutomation(appId, automationId);
      setAutomations((prev) => prev.filter((a) => a.id !== automationId));
      if (expandedId === automationId) setExpandedId(null);
    } catch {
      // ignore
    }
  };

  const handleRunNow = async (automationId: string) => {
    if (!appId) return;
    setRunningIds((prev) => new Set(prev).add(automationId));
    try {
      await runAutomationManually(appId, automationId);
      // Refresh runs if this automation is expanded
      if (expandedId === automationId) {
        await loadRuns(automationId);
      }
    } catch {
      // ignore
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(automationId);
        return next;
      });
    }
  };

  const handleExpand = async (automationId: string) => {
    if (expandedId === automationId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(automationId);
    await loadRuns(automationId);
  };

  const loadRuns = async (automationId: string) => {
    if (!appId) return;
    setRunsLoading(true);
    try {
      const res = await listAutomationRuns(appId, automationId);
      setRuns(res.runs);
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  };

  if (isLoading) {
    return <p className="text-gray-400">Loading automations...</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Automations</h2>
        {!showBuilder && (
          <button
            type="button"
            onClick={() => setShowBuilder(true)}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            <span>✨</span>
            New Automation
          </button>
        )}
      </div>

      {showBuilder && appId && typeId && (
        <AutomationBuilder
          appId={appId}
          typeId={typeId}
          onCreated={(automation) => {
            setAutomations((prev) => [automation, ...prev]);
            setShowBuilder(false);
          }}
          onCancel={() => setShowBuilder(false)}
        />
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {automations.length === 0 && !showBuilder ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm text-gray-500">No automations yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Click "+ New Automation" to create your first automation with AI
          </p>
        </div>
      ) : automations.length === 0 ? null : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className="rounded-xl border border-gray-200 bg-white"
            >
              {/* Automation row header */}
              <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3"
                onClick={() => handleExpand(automation.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {automation.name}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      {TRIGGER_LABELS[automation.trigger] ?? automation.trigger}
                    </span>
                  </div>
                  {automation.description && (
                    <p className="mt-0.5 text-xs text-gray-400 truncate">
                      {automation.description}
                    </p>
                  )}
                </div>

                {/* Enable/disable toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleEnabled(automation);
                  }}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                    automation.enabled ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  title={automation.enabled ? 'Disable' : 'Enable'}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                      automation.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>

                {/* Run now */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRunNow(automation.id);
                  }}
                  disabled={runningIds.has(automation.id)}
                  className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                  title="Run now"
                >
                  {runningIds.has(automation.id) ? '⟳' : '▶'}
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(automation.id);
                  }}
                  className="text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  ✕
                </button>

                {/* Expand chevron */}
                <span className="text-gray-400 text-xs">
                  {expandedId === automation.id ? '▲' : '▼'}
                </span>
              </div>

              {/* Expanded detail panel */}
              {expandedId === automation.id && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-4">
                  {/* Code preview */}
                  <div>
                    <div className="mb-1 text-xs font-medium text-gray-500">
                      Python Code
                    </div>
                    <pre className="max-h-60 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-400 font-mono">
                      {automation.code}
                    </pre>
                  </div>

                  {/* Run history */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">
                        Run History
                      </span>
                      <button
                        type="button"
                        onClick={() => loadRuns(automation.id)}
                        className="text-xs text-blue-500 hover:text-blue-700"
                      >
                        Refresh
                      </button>
                    </div>

                    {runsLoading ? (
                      <p className="text-xs text-gray-400">Loading runs...</p>
                    ) : runs.length === 0 ? (
                      <p className="text-xs text-gray-400">No runs yet</p>
                    ) : (
                      <div className="space-y-2">
                        {runs.map((run) => (
                          <RunRow key={run.id} run={run} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: AutomationRun }) {
  const [expanded, setExpanded] = useState(false);
  const badge = STATUS_BADGES[run.status] ?? {
    label: run.status,
    className: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
        <span className="text-[10px] text-gray-400">
          {run.triggerEvent}
        </span>
        {run.durationMs !== null && (
          <span className="text-[10px] text-gray-400">
            {run.durationMs}ms
          </span>
        )}
        <span className="flex-1" />
        <span className="text-[10px] text-gray-400">
          {new Date(run.createdAt).toLocaleString()}
        </span>
        <span className="text-[10px] text-gray-400">
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-3 py-2">
          {run.error && (
            <div className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600 font-mono">
              {run.error}
            </div>
          )}
          {run.logs.length > 0 ? (
            <div className="space-y-0.5">
              {run.logs.map((log, i) => (
                <div key={i} className="flex gap-2 text-[10px] font-mono">
                  <span
                    className={
                      log.level === 'error'
                        ? 'text-red-500'
                        : log.level === 'warn'
                          ? 'text-yellow-600'
                          : 'text-gray-500'
                    }
                  >
                    [{log.level}]
                  </span>
                  <span className="text-gray-700">{log.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">No logs</p>
          )}
        </div>
      )}
    </div>
  );
}
