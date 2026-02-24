import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { getMyServices, type Service } from '../api/services-client';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyServices()
      .then((res) => setServices(res.services))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const serviceIcons: Record<string, string> = {
    'rlc-controls': '\uD83D\uDD0D',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Vogt AI</h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              Platform
            </span>
          </div>
          <div className="flex items-center gap-4">
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Admin
              </Link>
            )}
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

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900">Your Services</h2>
          <p className="mt-1 text-sm text-gray-500">
            Access your assigned tools and automations
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400">Loading services...</div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {!isLoading && !error && services.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-gray-200 px-6 py-16 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900">No services assigned</h3>
            <p className="mt-1 text-sm text-gray-500">
              Contact your administrator to get access to services.
            </p>
          </div>
        )}

        {!isLoading && services.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <Link
                key={service.id}
                to={service.route}
                className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
              >
                <div className="mb-3 text-3xl">
                  {service.icon || serviceIcons[service.slug] || '⚡'}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                  {service.name}
                </h3>
                {service.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {service.description}
                  </p>
                )}
                <div className="mt-4 flex items-center text-sm font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                  Open →
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
