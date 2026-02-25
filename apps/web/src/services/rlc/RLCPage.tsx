import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../hooks/use-auth';
import {
  searchDocuments,
  getDocumentStats,
  getDocument,
  getDirectories,
  type DocumentSearchResult,
  type DocumentStats,
  type DocumentDetail,
  type SearchResponse,
  type DirectoryEntry,
} from './api';
import { ChatView } from './ChatView';

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: 'bg-red-100 text-red-700',
  docx: 'bg-blue-100 text-blue-700',
  docm: 'bg-blue-100 text-blue-700',
  xlsx: 'bg-green-100 text-green-700',
  xls: 'bg-green-100 text-green-700',
  xlsm: 'bg-green-100 text-green-700',
  msg: 'bg-amber-100 text-amber-700',
  eml: 'bg-purple-100 text-purple-700',
  txt: 'bg-gray-100 text-gray-700',
  csv: 'bg-gray-100 text-gray-700',
};

const ROOT_PREFIX = '/HITACHI RAIL COLLABORATION at RLC';

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncatePath(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 4) return path;
  return `/${parts[1]}/.../${parts.slice(-2).join('/')}`;
}

// --- Stats Panel ---

function StatsPanel({ stats }: { stats: DocumentStats }) {
  const pct = stats.totalDocuments > 0
    ? ((stats.indexedDocuments / stats.totalDocuments) * 100).toFixed(1)
    : '0';

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs font-medium text-gray-500 uppercase">Total Documents</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{stats.totalDocuments.toLocaleString()}</div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs font-medium text-gray-500 uppercase">Indexed</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{stats.indexedDocuments.toLocaleString()}</div>
        <div className="mt-0.5 text-xs text-gray-500">{pct}% of corpus</div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs font-medium text-gray-500 uppercase">Total Words</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{formatNumber(stats.totalWords)}</div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs font-medium text-gray-500 uppercase">File Types</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {stats.typeBreakdown.slice(0, 6).map((t) => (
            <span
              key={t.fileType}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${FILE_TYPE_COLORS[t.fileType] || 'bg-gray-100 text-gray-700'}`}
            >
              {t.fileType.toUpperCase()}
              <span className="opacity-60">{t.count.toLocaleString()}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Dropbox Link Icon ---

function DropboxLink({ url, className = '' }: { url: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`shrink-0 rounded p-0.5 text-gray-300 hover:text-blue-500 ${className}`}
      title="Open in Dropbox"
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

// --- Result Card ---

function ResultCard({
  result,
  index,
  isSelected,
  onClick,
}: {
  result: DocumentSearchResult;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const relevance = Math.min(result.rank * 100, 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        isSelected
          ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">#{index + 1}</span>
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${FILE_TYPE_COLORS[result.fileType] || 'bg-gray-100 text-gray-700'}`}
            >
              {result.fileType}
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">{result.fileName}</span>
            <DropboxLink url={result.dropboxUrl} />
          </div>
          <div className="mt-1 truncate text-xs text-gray-400" title={result.dropboxPath}>
            {truncatePath(result.dropboxPath)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="text-xs font-medium text-gray-500">Relevance</div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${relevance}%` }}
              />
            </div>
            <span className="text-xs font-mono text-gray-500">{result.rank.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {result.snippet && (
        <div
          className="mt-3 rounded bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 [&_mark]:rounded-sm [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark]:font-medium"
          dangerouslySetInnerHTML={{ __html: result.snippet }}
        />
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
        {result.fileSizeBytes != null && (
          <span>{formatBytes(result.fileSizeBytes)}</span>
        )}
        {result.wordCount != null && result.wordCount > 0 && (
          <span>{result.wordCount.toLocaleString()} words</span>
        )}
        {result.pageCount != null && result.pageCount > 0 && (
          <span>{result.pageCount} pages</span>
        )}
        {result.dropboxModified && (
          <span>Modified {formatDate(result.dropboxModified)}</span>
        )}
      </div>
    </button>
  );
}

// --- Document Detail Panel ---

function DocumentDetailPanel({
  doc,
  isLoading,
  searchQuery,
  onClose,
}: {
  doc: DocumentDetail | null;
  isLoading: boolean;
  searchQuery: string;
  onClose: () => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);

  const { highlightedHtml, highlightCount } = useMemo(() => {
    const fullText = doc?.extractedText || '';
    if (!fullText || !searchQuery.trim()) {
      return { highlightedHtml: fullText, highlightCount: 0 };
    }
    const escaped = fullText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const words = searchQuery.trim().split(/\s+/).filter(Boolean);
    let highlighted = escaped;
    let count = 0;
    for (const word of words) {
      const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      highlighted = highlighted.replace(regex, (_match, p1) => {
        count++;
        return `<mark class="bg-yellow-200 rounded-sm px-0.5">${p1}</mark>`;
      });
    }
    return { highlightedHtml: highlighted, highlightCount: count };
  }, [doc?.extractedText, searchQuery]);

  useEffect(() => {
    if (doc && textRef.current) {
      const firstMark = textRef.current.querySelector('mark');
      if (firstMark) {
        firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [doc]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-400">Loading document...</div>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Panel Header */}
      <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${FILE_TYPE_COLORS[doc.fileType] || 'bg-gray-100 text-gray-700'}`}
            >
              {doc.fileType}
            </span>
            <h2 className="truncate text-sm font-bold text-gray-900">{doc.fileName}</h2>
            <DropboxLink url={doc.dropboxUrl} />
          </div>
          <div className="mt-1 text-xs text-gray-400 break-all">{doc.dropboxPath}</div>
        </div>
        <button
          onClick={onClose}
          className="ml-2 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Metadata bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
        {doc.fileSizeBytes != null && <span>{formatBytes(doc.fileSizeBytes)}</span>}
        {doc.wordCount != null && doc.wordCount > 0 && <span>{doc.wordCount.toLocaleString()} words</span>}
        {doc.pageCount != null && doc.pageCount > 0 && <span>{doc.pageCount} pages</span>}
        {doc.dropboxModified && <span>Modified {formatDate(doc.dropboxModified)}</span>}
        {highlightCount > 0 && (
          <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-medium text-yellow-700">
            {highlightCount} matches
          </span>
        )}
        <a
          href={doc.dropboxUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-600 hover:bg-blue-100"
        >
          Open in Dropbox
        </a>
      </div>

      {/* Full Text */}
      {doc.extractedText ? (
        <div
          ref={textRef}
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          <div
            className="prose prose-sm max-w-none whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-700"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center text-sm text-gray-400">
            <div>No text content available</div>
            {doc.errorMessage && (
              <div className="mt-1 text-xs text-red-400">{doc.errorMessage}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Pagination ---

function Pagination({
  page,
  total,
  limit,
  onPageChange,
}: {
  page: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-sm text-gray-500">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

// --- Directory Filter ---

function DirectoryFilter({
  directories,
  value,
  onChange,
}: {
  directories: DirectoryEntry[];
  value: string;
  onChange: (dir: string) => void;
}) {
  const topLevel = useMemo(() => {
    const seen = new Map<string, number>();
    for (const dir of directories) {
      const relative = dir.path.replace(ROOT_PREFIX, '');
      const parts = relative.split('/').filter(Boolean);
      if (parts.length >= 1) {
        const top = ROOT_PREFIX + '/' + parts[0];
        seen.set(top, (seen.get(top) || 0) + dir.docCount);
      }
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [directories]);

  if (topLevel.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
    >
      <option value="">All Folders</option>
      {topLevel.map(([path, count]) => (
        <option key={path} value={path}>
          {path.replace(ROOT_PREFIX + '/', '')} ({count})
        </option>
      ))}
    </select>
  );
}

// --- Main Page ---

export function RLCPage() {
  const { user, logout } = useAuth();

  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [fileType, setFileType] = useState('');
  const [selectedDirectory, setSelectedDirectory] = useState('');
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [page, setPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // Document detail state
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  useEffect(() => {
    getDocumentStats().then(setStats).catch(() => {});
    getDirectories().then((res) => setDirectories(res.directories)).catch(() => {});
  }, []);

  const handleSearch = async (e?: FormEvent, overridePage?: number) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError('');
    setSelectedDocId(null);
    setSelectedDoc(null);
    const targetPage = overridePage ?? 1;

    try {
      const res = await searchDocuments({
        q: query.trim(),
        type: fileType || undefined,
        directory: selectedDirectory || undefined,
        limit: 20,
        page: targetPage,
      });
      setSearchResponse(res);
      setPage(targetPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    handleSearch(undefined, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectDoc = async (docId: string) => {
    if (docId === selectedDocId) {
      setSelectedDocId(null);
      setSelectedDoc(null);
      return;
    }

    setSelectedDocId(docId);
    setIsLoadingDoc(true);
    setSelectedDoc(null);

    try {
      const doc = await getDocument(docId);
      setSelectedDoc(doc);
    } catch {
      setSelectedDoc(null);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const detailOpen = selectedDocId !== null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-gray-400 hover:text-gray-600">
              vogt-ai
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-lg font-bold text-gray-900">RL Controls</h1>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              Document Search
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-[1600px] px-4">
          <nav className="flex gap-6">
            <button
              onClick={() => setMode('search')}
              className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                mode === 'search'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Search
            </button>
            <button
              onClick={() => setMode('chat')}
              className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                mode === 'chat'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              AI Search
            </button>
          </nav>
        </div>
      </div>

      {mode === 'chat' ? (
        <ChatView stats={stats} />
      ) : (
        /* Search mode */
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Search + Results */}
          <div className={`flex-1 overflow-y-auto transition-all ${detailOpen ? 'max-w-[55%]' : ''}`}>
            <div className="mx-auto max-w-4xl px-4 py-6">
              {/* Stats */}
              {stats && <StatsPanel stats={stats} />}

              {/* Search Form */}
              <form onSubmit={handleSearch} className="mt-6">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search documents... (e.g. delay notice, change order, CDR review)"
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pl-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <svg
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <DirectoryFilter
                    directories={directories}
                    value={selectedDirectory}
                    onChange={setSelectedDirectory}
                  />
                  <select
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">All Types</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">DOCX</option>
                    <option value="xlsx">XLSX</option>
                    <option value="msg">MSG (Email)</option>
                    <option value="eml">EML (Email)</option>
                    <option value="txt">TXT</option>
                    <option value="csv">CSV</option>
                  </select>
                  <button
                    type="submit"
                    disabled={isSearching || !query.trim()}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </form>

              {/* Error */}
              {error && (
                <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Search Results */}
              {searchResponse && (
                <div className="mt-6">
                  {/* Results Header */}
                  <div className="mb-4 flex items-baseline justify-between">
                    <div className="text-sm text-gray-600">
                      Found <span className="font-semibold text-gray-900">{searchResponse.total.toLocaleString()}</span> results
                      for &ldquo;<span className="font-medium text-gray-900">{searchResponse.query}</span>&rdquo;
                      {fileType && (
                        <span className="ml-1">
                          in <span className="font-medium uppercase">{fileType}</span> files
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">
                        {searchResponse.searchTimeMs}ms
                      </span>
                      <span>query time</span>
                    </div>
                  </div>

                  {/* Results List */}
                  {searchResponse.results.length > 0 ? (
                    <div className="space-y-3">
                      {searchResponse.results.map((result, i) => (
                        <ResultCard
                          key={result.id}
                          result={result}
                          index={(searchResponse.page - 1) * searchResponse.limit + i}
                          isSelected={result.id === selectedDocId}
                          onClick={() => handleSelectDoc(result.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
                      <div className="text-gray-400">No results found</div>
                      <div className="mt-1 text-sm text-gray-400">
                        Try simpler terms or remove the file type filter
                      </div>
                    </div>
                  )}

                  {/* Pagination */}
                  <Pagination
                    page={searchResponse.page}
                    total={searchResponse.total}
                    limit={searchResponse.limit}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}

              {/* Empty State */}
              {!searchResponse && !error && (
                <div className="mt-16 text-center">
                  <div className="text-4xl">&#128269;</div>
                  <h2 className="mt-3 text-lg font-semibold text-gray-900">Search the Document Corpus</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Full-text search across {stats?.indexedDocuments.toLocaleString() ?? '...'} indexed documents
                    ({stats ? formatNumber(stats.totalWords) : '...'} words) from the Hitachi Rail Dropbox.
                  </p>
                  <div className="mx-auto mt-4 max-w-md text-left">
                    <div className="text-xs font-medium text-gray-500 uppercase">Try searching for:</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {['delay notice', 'change order', 'site readiness', 'WCS installation', 'CDR review', 'liquidated damages'].map((term) => (
                        <button
                          key={term}
                          onClick={() => {
                            setQuery(term);
                            setTimeout(() => {
                              searchDocuments({ q: term, limit: 20, page: 1 }).then((res) => {
                                setSearchResponse(res);
                                setPage(1);
                              });
                            }, 0);
                          }}
                          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Document Detail Panel */}
          {detailOpen && (
            <div className="w-[45%] shrink-0 border-l border-gray-200 bg-white">
              <DocumentDetailPanel
                doc={selectedDoc}
                isLoading={isLoadingDoc}
                searchQuery={searchResponse?.query ?? ''}
                onClose={() => {
                  setSelectedDocId(null);
                  setSelectedDoc(null);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
