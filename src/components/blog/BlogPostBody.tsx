
import type { ReactNode } from 'react';
import { BlogBanner } from '@/components/blog/BlogBanner';
import BlogContent from '@/components/blog/BlogContent';

interface BlogPostBodyProps {
  bannerImage: string;
  bannerImageAlt: string;
  content?: string;
  fallback: ReactNode;
}

export function BlogPostBody({ bannerImage, bannerImageAlt, content, fallback }: BlogPostBodyProps) {
  return (
    <>
      <BlogBanner
        src={bannerImage}
        width={1100}
        widths={[480, 736, 1100, 1440]}
        sizes="(min-width: 896px) 896px, 100vw"
        alt={bannerImageAlt}
        loading="eager"
        fetchPriority="high"
        className="mb-8 rounded-2xl"
      />
      <div className="mb-12">
        {content === undefined ? fallback : <BlogContent content={content} />}
      </div>
    </>
  );
}
