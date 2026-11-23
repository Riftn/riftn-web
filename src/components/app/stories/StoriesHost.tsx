/**
 * Mounts the story viewer and creator over the app. Lazy: nothing of either
 * loads until someone opens a moment or taps +.
 */
import { useStoriesStore } from '@/store/storiesStore';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';

export default function StoriesHost() {
  const viewer = useStoriesStore(s => s.viewer);
  const creator = useStoriesStore(s => s.creator);
  const closeViewer = useStoriesStore(s => s.closeViewer);
  const closeCreator = useStoriesStore(s => s.closeCreator);
  return (
    <>
      {viewer && (
        <StoryViewer
          key={`${viewer.entries[viewer.author]?.author.address}-${viewer.item}-${viewer.entries[viewer.author]?.items[viewer.item]?.id ?? ''}`}
          entries={viewer.entries}
          startAuthor={viewer.author}
          startItem={viewer.item}
          onClose={closeViewer}
        />
      )}
      {creator && <StoryCreator onClose={closeCreator} remixSource={creator.remixSource} postTokenId={creator.postTokenId} />}
    </>
  );
}
