import { useState, useEffect } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../hooks/use-auth';
import { getMyServices } from '../api/services-client';
import type { ReactNode } from 'react';

interface ServiceRouteProps {
  slug: string;
  children: ReactNode;
}

export function ServiceRoute({ slug, children }: ServiceRouteProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;

    // Admins always have access
    if (user.role === 'admin') {
      setHasAccess(true);
      return;
    }

    getMyServices()
      .then(({ services }) => {
        setHasAccess(services.some((s) => s.slug === slug));
      })
      .catch(() => setHasAccess(false));
  }, [user, slug]);

  if (authLoading || (user && hasAccess === null)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
