import React from 'react';
import PhotoEditor from '../ui/PhotoEditor';
import VideoEditor from '../ui/VideoEditor';
import EditorErrorBoundary from '../ui/EditorErrorBoundary';
import type { MediaComposer } from '../../hooks/useMediaComposer';

/** Full-screen photo / video editor for the composer's current media. */
export default function ComposerEditor({ composer }: { composer: MediaComposer }) {
  const { state, config } = composer;
  const media = state.media;
  if (!media) return null;
  if (media.mediaType === 'image') {
    return (
      <EditorErrorBoundary onClose={composer.closeEditor}>
        <PhotoEditor
          imageUri={media.uri}
          title={config.editorTitle}
          preferredAspect={config.aspect}
          enableOverlays
          onSave={composer.savePhotoEdit}
          onCancel={composer.closeEditor}
        />
      </EditorErrorBoundary>
    );
  }
  return (
    <EditorErrorBoundary onClose={composer.closeEditor}>
      <VideoEditor
        videoUri={media.uri}
        title={config.editorTitle}
        mode={config.kind === 'story' ? 'story' : 'reel'}
        initialSettings={state.videoEdit}
        maxClipMs={config.kind === 'story' ? config.maxClipMs : undefined}
        hintDurationMs={media.durationMs}
        initialFrames={state.frames}
        onSave={composer.saveVideoEdit}
        onCancel={composer.closeEditor}
      />
    </EditorErrorBoundary>
  );
}
