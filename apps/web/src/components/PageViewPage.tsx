import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { getPageBySlug } from '../api/apps-client';
import { PageRenderer } from '../registry/page-renderer';
import type { PageConfig } from '../registry/types';

export function PageViewPage() {
  const { appId, pageSlug } = useParams<{ appId: string; pageSlug: string }>();
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [pageName, setPageName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!appId || !pageSlug) return;
    getPageBySlug(appId, pageSlug)
      .then((res) => {
        if (!res.page.published) {
          setError('This page is not published');
          return;
        }
        setConfig(res.page.config as unknown as PageConfig);
        setPageName(res.page.name);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [appId, pageSlug]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-gray-500">{error}</p>
        <Link to={`/apps/${appId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to app
        </Link>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Page not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageRenderer config={config} appId={appId!} />
    </div>
  );
}
