import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import {
  getUsers,
  getInviteCodes,
  getServices,
  createInviteCode,
  deleteInviteCode,
  deleteUser,
  updateUserRole,
  grantServiceAccess,
  revokeServiceAccess,
  type AdminUser,
  type InviteCode,
  type AdminService,
} from '../api/admin-client';

type Tab = 'users' | 'invites' | 'services';

export function AdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('users');

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xl font-bold text-gray-900 hover:text-blue-600">
              Vogt AI
            </Link>
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Dashboard
            </Link>
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl gap-6 px-6">
          {(['users', 'invites', 'services'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 py-3 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'invites' ? 'Invite Codes' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-6">
        {tab === 'users' && <UsersPanel />}
        {tab === 'invites' && <InviteCodesPanel />}
        {tab === 'services' && <ServicesPanel />}
      </main>
    </div>
  );
}

// ===================== CONFIRM DIALOG =====================

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== USERS PANEL =====================

type PendingAction =
  | { type: 'role'; userId: string; userEmail: string; currentRole: string }
  | { type: 'delete'; userId: string; userEmail: string }
  | { type: 'grantService'; userId: string; userEmail: string; serviceId: string; serviceName: string }
  | { type: 'revokeService'; userId: string; userEmail: string; serviceId: string; serviceName: string };

function UsersPanel() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allServices, setAllServices] = useState<AdminService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const load = useCallback(async () => {
    try {
      const [usersRes, servicesRes] = await Promise.all([getUsers(), getServices()]);
      setUsers(usersRes.users);
      setAllServices(servicesRes.services);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    try {
      if (action.type === 'role') {
        const newRole = action.currentRole === 'admin' ? 'user' : 'admin';
        await updateUserRole(action.userId, newRole);
      } else if (action.type === 'delete') {
        await deleteUser(action.userId);
      } else if (action.type === 'grantService') {
        await grantServiceAccess(action.userId, action.serviceId);
      } else if (action.type === 'revokeService') {
        await revokeServiceAccess(action.userId, action.serviceId);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  if (isLoading) return <div className="py-8 text-center text-gray-400">Loading users...</div>;
  if (error) return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>;

  const confirmTitle = (() => {
    if (!pendingAction) return '';
    if (pendingAction.type === 'delete') return 'Delete user';
    if (pendingAction.type === 'role') return pendingAction.currentRole === 'admin' ? 'Remove admin access' : 'Grant admin access';
    if (pendingAction.type === 'grantService') return 'Grant service access';
    if (pendingAction.type === 'revokeService') return 'Revoke service access';
    return '';
  })();

  const confirmMessage = (() => {
    if (!pendingAction) return '';
    if (pendingAction.type === 'delete') return `Permanently delete ${pendingAction.userEmail}? This cannot be undone.`;
    if (pendingAction.type === 'role') return pendingAction.currentRole === 'admin'
      ? `Remove admin role from ${pendingAction.userEmail}?`
      : `Grant admin role to ${pendingAction.userEmail}?`;
    if (pendingAction.type === 'grantService') return `Grant ${pendingAction.serviceName} access to ${pendingAction.userEmail}?`;
    if (pendingAction.type === 'revokeService') return `Remove ${pendingAction.serviceName} access from ${pendingAction.userEmail}?`;
    return '';
  })();

  return (
    <div className="space-y-4">
      <ConfirmDialog
        isOpen={pendingAction !== null}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={pendingAction?.type === 'delete' ? 'Delete' : 'Confirm'}
        danger={pendingAction?.type === 'delete' || pendingAction?.type === 'revokeService'}
        onConfirm={handleConfirm}
        onCancel={() => setPendingAction(null)}
      />

      <h3 className="text-lg font-semibold text-gray-900">Users ({users.length})</h3>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Services</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Joined</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <tr key={u.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.email}
                    {isSelf && (
                      <span className="ml-2 text-xs text-gray-400">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.services.map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                        >
                          {s.name}
                          <button
                            onClick={() =>
                              setPendingAction({
                                type: 'revokeService',
                                userId: u.id,
                                userEmail: u.email,
                                serviceId: s.id,
                                serviceName: s.name,
                              })
                            }
                            className="ml-0.5 text-blue-400 hover:text-red-500"
                            title="Revoke access"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {allServices.filter((s) => !u.services.some((us) => us.id === s.id)).length > 0 && (
                        <select
                          className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500"
                          value=""
                          onChange={(e) => {
                            const serviceId = e.target.value;
                            if (!serviceId) return;
                            const svc = allServices.find((s) => s.id === serviceId);
                            if (svc) {
                              setPendingAction({
                                type: 'grantService',
                                userId: u.id,
                                userEmail: u.email,
                                serviceId: svc.id,
                                serviceName: svc.name,
                              });
                            }
                          }}
                        >
                          <option value="">+ Add</option>
                          {allServices
                            .filter((s) => !u.services.some((us) => us.id === s.id))
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setPendingAction({
                            type: 'role',
                            userId: u.id,
                            userEmail: u.email,
                            currentRole: u.role,
                          })
                        }
                        className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        title={u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      >
                        {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                      </button>
                      {!isSelf && (
                        <button
                          onClick={() =>
                            setPendingAction({
                              type: 'delete',
                              userId: u.id,
                              userEmail: u.email,
                            })
                          }
                          className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===================== INVITE CODES PANEL =====================

function InviteCodesPanel() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getInviteCodes();
      setCodes(res.inviteCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    try {
      await createInviteCode(30); // 30 day expiry
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create code');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInviteCode(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete code');
    }
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) return <div className="py-8 text-center text-gray-400">Loading codes...</div>;

  const availableCodes = codes.filter((c) => !c.usedBy);
  const usedCodes = codes.filter((c) => c.usedBy);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Invite Codes</h3>
        <button
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Generate Code
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Available codes */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-600">
          Available ({availableCodes.length})
        </h4>
        {availableCodes.length === 0 ? (
          <p className="text-sm text-gray-400">No available invite codes. Generate one above.</p>
        ) : (
          <div className="space-y-2">
            {availableCodes.map((code) => (
              <div
                key={code.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <code className="rounded bg-gray-100 px-2 py-1 text-sm font-mono font-bold text-gray-800">
                    {code.code}
                  </code>
                  <button
                    onClick={() => handleCopy(code.code, code.id)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    {copiedId === code.id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  {code.expiresAt && (
                    <span className="text-xs text-gray-400">
                      Expires {new Date(code.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(code.id)}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Used codes */}
      {usedCodes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-600">
            Used ({usedCodes.length})
          </h4>
          <div className="space-y-2">
            {usedCodes.map((code) => (
              <div
                key={code.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <code className="text-sm font-mono text-gray-400 line-through">
                    {code.code}
                  </code>
                  <span className="text-xs text-gray-400">
                    Used by {code.usedByEmail || 'unknown'}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {code.usedAt ? new Date(code.usedAt).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== SERVICES PANEL =====================

function ServicesPanel() {
  const [services, setServices] = useState<AdminService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getServices()
      .then((res) => setServices(res.services))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <div className="py-8 text-center text-gray-400">Loading services...</div>;
  if (error) return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Registered Services ({services.length})</h3>
      {services.length === 0 ? (
        <p className="text-sm text-gray-400">No services registered. Run the bootstrap script to seed services.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {services.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-gray-200 bg-white p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">{s.name}</h4>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {s.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  {s.description && (
                    <p className="mt-1 text-sm text-gray-500">{s.description}</p>
                  )}
                </div>
                <span className="text-2xl">{s.icon || '⚡'}</span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                <span>Slug: {s.slug}</span>
                <span>Route: {s.route}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
