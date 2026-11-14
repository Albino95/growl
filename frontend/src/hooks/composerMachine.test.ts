import { describe, expect, it } from 'vitest';
import {
  canPublish,
  composerReducer as reduce,
  hasComposerDraft,
  initialComposerState,
  type ComposerAction,
  type ComposerMedia,
  type ComposerState,
} from './composerMachine';

const photo: ComposerMedia = { uri: 'file:///a.jpg', mediaType: 'image', durationMs: 0 };
const clip: ComposerMedia = { uri: 'file:///c.mp4', mediaType: 'video', mimeType: 'video/mp4', durationMs: 45_000 };

function run(state: ComposerState, ...actions: ComposerAction[]): ComposerState {
  return actions.reduce(reduce, state);
}

function ready(media: ComposerMedia = photo, maxClipMs = 0): ComposerState {
  return run(initialComposerState(), { type: 'IMPORT_START' }, { type: 'IMPORT_DONE', media, maxClipMs });
}

describe('composerMachine', () => {
  it('starts empty with the seeded caption / category', () => {
    const s = initialComposerState({ caption: 'hi', category: 'fitness' });
    expect(s.status).toBe('empty');
    expect(s.caption).toBe('hi');
    expect(s.category).toBe('fitness');
  });

  it('empty → importing → ready', () => {
    const importing = reduce(initialComposerState(), { type: 'IMPORT_START' });
    expect(importing.status).toBe('importing');
    const s = reduce(importing, { type: 'IMPORT_DONE', media: photo, maxClipMs: 0 });
    expect(s.status).toBe('ready');
    expect(s.media).toEqual(photo);
    expect(s.frames).toEqual([]);
    expect(s.stillsBusy).toBe(false);
  });

  it('cancelled import returns to where it came from', () => {
    expect(run(initialComposerState(), { type: 'IMPORT_START' }, { type: 'IMPORT_CANCEL' }).status).toBe('empty');
    const replacing = run(ready(), { type: 'IMPORT_START' });
    expect(replacing.status).toBe('importing');
    const back = reduce(replacing, { type: 'IMPORT_CANCEL' });
    expect(back.status).toBe('ready');
    expect(back.media).toEqual(photo);
  });

  it('clamps over-cap clips and arms stills', () => {
    const frames = [{ uri: '', timeMs: 0, placeholder: true }];
    const s = run(
      initialComposerState(),
      { type: 'IMPORT_START' },
      { type: 'IMPORT_DONE', media: clip, maxClipMs: 30_000, frames }
    );
    expect(s.videoEdit.trimEndMs).toBe(30_000);
    expect(s.frames).toBe(frames);
    expect(s.stillsBusy).toBe(true);
    expect(ready(clip, 60_000).videoEdit.trimEndMs).toBe(0);
    expect(reduce(s, { type: 'STILLS_BUSY', busy: false }).stillsBusy).toBe(false);
  });

  it('ignores IMPORT_DONE when not importing', () => {
    const s = ready();
    expect(reduce(s, { type: 'IMPORT_DONE', media: clip, maxClipMs: 0 })).toBe(s);
  });

  it('ready ⇄ editing (open, shown, cancel)', () => {
    const opening = reduce(ready(), { type: 'OPEN_EDITOR' });
    expect(opening.status).toBe('editing');
    expect(opening.editorShown).toBe(false);
    const shown = reduce(opening, { type: 'EDITOR_SHOWN' });
    expect(shown.editorShown).toBe(true);
    const closed = reduce(shown, { type: 'CLOSE_EDITOR' });
    expect(closed.status).toBe('ready');
    expect(closed.edited).toBe(false);
    expect(closed.media).toEqual(photo);
  });

  it('cannot open the editor without media or while publishing', () => {
    const empty = initialComposerState();
    expect(reduce(empty, { type: 'OPEN_EDITOR' })).toBe(empty);
    const publishing = reduce(ready(), { type: 'PUBLISH_START' });
    expect(reduce(publishing, { type: 'OPEN_EDITOR' })).toBe(publishing);
  });

  it('photo save swaps the uri, marks edited and drops a stale upload', () => {
    let s = ready();
    s = { ...s, upload: { sourceUri: photo.uri, url: 'https://x/api/v1/media/a', mediaType: 'image' } };
    s = run(s, { type: 'OPEN_EDITOR' }, { type: 'EDITOR_SHOWN' }, { type: 'PHOTO_EDITED', uri: 'file:///edited.jpg' });
    expect(s.status).toBe('ready');
    expect(s.media?.uri).toBe('file:///edited.jpg');
    expect(s.edited).toBe(true);
    expect(s.upload).toBeNull();
  });

  it('photo save with the same uri is not an edit', () => {
    const s = run(ready(), { type: 'OPEN_EDITOR' }, { type: 'PHOTO_EDITED', uri: photo.uri });
    expect(s.edited).toBe(false);
  });

  it('video save keeps the clip upload but drops a stale cover', () => {
    let s = ready(clip);
    s = {
      ...s,
      upload: { sourceUri: clip.uri, url: 'https://x/api/v1/media/c', mediaType: 'video', coverUrl: 'https://x/api/v1/media/cv' },
    };
    s = run(s, { type: 'OPEN_EDITOR' }, {
      type: 'VIDEO_EDITED',
      settings: { ...s.videoEdit, trimStartMs: 2000 },
    });
    expect(s.status).toBe('ready');
    expect(s.edited).toBe(true);
    expect(s.videoEdit.trimStartMs).toBe(2000);
    expect(s.upload?.url).toBe('https://x/api/v1/media/c');
    expect(s.upload?.coverUrl).toBeUndefined();
  });

  it('publishing walks its phases to success', () => {
    let s = reduce(ready(), { type: 'PUBLISH_START' });
    expect(s.status).toBe('publishing');
    expect(s.phase).toBe('preparing');
    s = reduce(s, { type: 'PUBLISH_PHASE', phase: 'uploading' });
    expect(s.phase).toBe('uploading');
    s = reduce(s, { type: 'UPLOADED', upload: { sourceUri: photo.uri, url: 'https://x/api/v1/media/a', mediaType: 'image' } });
    s = reduce(s, { type: 'PUBLISH_PHASE', phase: 'publishing' });
    expect(s.phase).toBe('publishing');
    s = reduce(s, { type: 'PUBLISH_SUCCESS' });
    expect(s.status).toBe('success');
    expect(s.phase).toBeNull();
    expect(hasComposerDraft(s)).toBe(false);
  });

  it('double publish is a no-op while publishing', () => {
    const s = reduce(ready(), { type: 'PUBLISH_START' });
    const progressed = reduce(s, { type: 'PUBLISH_PHASE', phase: 'uploading' });
    expect(reduce(progressed, { type: 'PUBLISH_START' })).toBe(progressed);
    expect(reduce(initialComposerState(), { type: 'PUBLISH_START' }).status).toBe('empty');
  });

  it('draft is frozen while publishing', () => {
    const s = run(ready(), { type: 'SET_CAPTION', caption: 'a' }, { type: 'PUBLISH_START' });
    expect(reduce(s, { type: 'SET_CAPTION', caption: 'b' }).caption).toBe('a');
    expect(reduce(s, { type: 'SET_CATEGORY', category: 'x' })).toBe(s);
    expect(reduce(s, { type: 'REMOVE_MEDIA' })).toBe(s);
    expect(reduce(s, { type: 'DISCARD' })).toBe(s);
    expect(reduce(s, { type: 'IMPORT_START' })).toBe(s);
  });

  it('failure keeps the whole draft (and the upload) for retry', () => {
    const upload = { sourceUri: photo.uri, url: 'https://x/api/v1/media/a', mediaType: 'image' as const };
    const s = run(
      ready(),
      { type: 'SET_CAPTION', caption: 'hello' },
      { type: 'SET_CATEGORY', category: 'fitness' },
      { type: 'PUBLISH_START' },
      { type: 'UPLOADED', upload },
      { type: 'PUBLISH_FAIL', message: 'offline' }
    );
    expect(s.status).toBe('error');
    expect(s.error).toBe('offline');
    expect(s.media).toEqual(photo);
    expect(s.caption).toBe('hello');
    expect(s.category).toBe('fitness');
    expect(s.upload).toEqual(upload);
    expect(hasComposerDraft(s)).toBe(true);

    const retry = reduce(s, { type: 'PUBLISH_START' });
    expect(retry.status).toBe('publishing');
    expect(retry.error).toBeNull();
    expect(retry.upload).toEqual(upload);
  });

  it('error → dismiss → ready, or → edit', () => {
    const err = run(ready(), { type: 'PUBLISH_START' }, { type: 'PUBLISH_FAIL', message: 'x' });
    expect(reduce(err, { type: 'DISMISS_ERROR' }).status).toBe('ready');
    const editing = reduce(err, { type: 'OPEN_EDITOR' });
    expect(editing.status).toBe('editing');
    expect(editing.error).toBeNull();
  });

  it('remove / discard clear the draft but keep the category', () => {
    const s = run(ready(), { type: 'SET_CAPTION', caption: 'x' }, { type: 'SET_CATEGORY', category: 'mind' });
    for (const type of ['REMOVE_MEDIA', 'DISCARD'] as const) {
      const out = reduce(s, { type });
      expect(out.status).toBe('empty');
      expect(out.media).toBeNull();
      expect(out.caption).toBe('');
      expect(out.category).toBe('mind');
    }
  });

  it('canPublish needs media, a resting state and (when required) a category', () => {
    expect(canPublish(initialComposerState(), { categoryRequired: false })).toBe(false);
    const s = ready();
    expect(canPublish(s, { categoryRequired: false })).toBe(true);
    expect(canPublish(s, { categoryRequired: true })).toBe(false);
    const withCat = reduce(s, { type: 'SET_CATEGORY', category: 'mind' });
    expect(canPublish(withCat, { categoryRequired: true })).toBe(true);
    expect(canPublish(reduce(withCat, { type: 'PUBLISH_START' }), { categoryRequired: true })).toBe(false);
    expect(canPublish(reduce(withCat, { type: 'OPEN_EDITOR' }), { categoryRequired: true })).toBe(false);
  });

  it('hasComposerDraft counts media, caption, audio and importing', () => {
    expect(hasComposerDraft(initialComposerState())).toBe(false);
    expect(hasComposerDraft(initialComposerState({ caption: ' x ' }))).toBe(true);
    expect(hasComposerDraft(reduce(initialComposerState(), { type: 'IMPORT_START' }))).toBe(true);
    expect(hasComposerDraft(reduce(initialComposerState(), { type: 'SET_AUDIO', audio: { id: '1', title: 't', url: 'u' } }))).toBe(true);
  });
});
