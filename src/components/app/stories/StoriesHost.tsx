/**
 * Mounts the story viewer and creator over the app. Lazy: nothing of either
 * loads until someone opens a moment or taps +.
 */
import { useStoriesStore } from '@/store/storiesStore';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';

export default function StoriesHost() {
  const viewer = useStoriesStore(s => s.viewer);
  const creatorOpen = useStoriesStore(s => s.creatorOpen);
  const closeViewer = useStoriesStore(s => s.closeViewer);
  const closeCreator = useStoriesStore(s => s.closeCreator);
  return (
    <>
      {viewer && (
        <StoryViewer
          key={`${viewer.entries[viewer.author]?.author.address}-${viewer.item}`}
          entries={viewer.entries}
          startAuthor={viewer.author}
          startItem={viewer.item}
          onClose={closeViewer}
        />
      )}
      {creatorOpen && <StoryCreator onClose={closeCreator} />}
    </>
  );
}
