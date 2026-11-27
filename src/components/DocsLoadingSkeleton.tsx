export function DocsContentSkeleton({ article = false }: { article?: boolean }) {
  return (
    <div className="docs-loading-content" data-docs-loading-article={article ? '' : undefined} aria-hidden="true">
      <span className="docs-loading-crumb" />
      <span className="docs-loading-title" />
      <span className="docs-loading-meta" />
      {article && <span className="docs-loading-cover" />}
      <span className="docs-loading-line" />
      <span className="docs-loading-line" />
    </div>
  );
}

export function DocsLoadingSkeleton({ pathname }: { pathname: string }) {
  const article = /^\/(?:guides|docs\/blog)\/[^/]+\/?$/.test(pathname);
  return (
    <div className="docs-loading-shell" aria-hidden="true">
      <div className="docs-loading-header"><span /><span /><span /></div>
      <div className="docs-loading-row">
        <div className="docs-loading-sidebar"><span /><span /><span /><span /><span /><span /></div>
        <div className="docs-loading-column">
          <div className="docs-loading-frame"><DocsContentSkeleton article={article} /></div>
        </div>
      </div>
    </div>
  );
}
