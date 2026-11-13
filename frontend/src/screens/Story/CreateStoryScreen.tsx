import React from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useMediaComposer } from '../../hooks/useMediaComposer';
import ComposerShell from '../../components/composer/ComposerShell';
import ComposerEditor from '../../components/composer/ComposerEditor';
import ComposerMediaStage from '../../components/composer/ComposerMediaStage';
import ComposerCaption from '../../components/composer/ComposerCaption';
import ComposerStickyBar from '../../components/composer/ComposerStickyBar';
import MediaSourcePicker from '../../components/composer/MediaSourcePicker';
import PublishingOverlay from '../../components/composer/PublishingOverlay';
import ToolChipRow from '../../components/composer/ToolChipRow';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreateStory'>;
};

export default function CreateStoryScreen({ navigation }: Props) {
  const composer = useMediaComposer({ kind: 'story', navigation });
  const { state, config, isVideo, publishing } = composer;

  if (composer.editorVisible) return <ComposerEditor composer={composer} />;

  const busy = publishing || state.status === 'editing';

  return (
    <ComposerShell
      title={config.title}
      onClose={composer.requestClose}
      closeDisabled={publishing}
      footer={
        state.media ? (
          <ComposerStickyBar
            publishing={publishing}
            canPublish={composer.canSubmit}
            error={
              state.status === 'error' && state.error
                ? { message: state.error, onRetry: () => void composer.retry(), onEdit: composer.editAfterError }
                : null
            }
            onSubmit={composer.submit}
            onLongSubmit={composer.longSubmit}
          />
        ) : null
      }
      overlay={state.status === 'success' ? <PublishingOverlay variant="success" /> : null}
    >
      {!state.media ? (
        <MediaSourcePicker
          icon={config.empty.icon}
          title={config.empty.title}
          subtitle={config.empty.subtitle}
          busyLabel={state.status === 'importing' ? config.empty.importing : null}
          onCamera={() => void composer.pick('camera')}
          onLibrary={() => void composer.pick('library')}
        />
      ) : (
        <>
          <ComposerMediaStage
            composer={composer}
            badge={isVideo ? `Video · ${config.maxClipMs / 1000}s max` : null}
          />
          <ToolChipRow
            chips={[
              {
                key: 'edit',
                icon: isVideo ? 'cut-outline' : 'color-wand-outline',
                label: isVideo ? 'Trim' : 'Edit',
                accessibilityLabel: isVideo ? 'Trim clip' : 'Edit photo',
                onPress: composer.openEditor,
                disabled: busy,
              },
              {
                key: 'replace',
                icon: 'images-outline',
                label: 'Replace',
                onPress: () => void composer.pick('library'),
                disabled: busy,
              },
              {
                key: 'remove',
                icon: 'trash-outline',
                label: 'Remove',
                danger: true,
                onPress: () => void composer.removeMedia(),
                disabled: busy,
              },
            ]}
          />
          <ComposerCaption
            caption={state.caption}
            onChangeCaption={composer.setCaption}
            maxLength={config.captionMax}
            inputRef={composer.captionInputRef}
            editable={!publishing}
          />
        </>
      )}
    </ComposerShell>
  );
}
