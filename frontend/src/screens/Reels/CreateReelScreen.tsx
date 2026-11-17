import React from 'react';
import { Text } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useMediaComposer } from '../../hooks/useMediaComposer';
import ComposerShell from '../../components/composer/ComposerShell';
import ComposerEditor from '../../components/composer/ComposerEditor';
import ComposerMediaStage from '../../components/composer/ComposerMediaStage';
import ComposerCaption from '../../components/composer/ComposerCaption';
import ComposerStickyBar from '../../components/composer/ComposerStickyBar';
import CategoryPicker from '../../components/composer/CategoryPicker';
import MediaSourcePicker from '../../components/composer/MediaSourcePicker';
import PublishingOverlay from '../../components/composer/PublishingOverlay';
import ToolChipRow from '../../components/composer/ToolChipRow';
import ReelCameraCapture from '../../components/ui/videoEditor/ReelCameraCapture';
import { openReelsAtPost } from '../../utils/reelNavigation';
import tw from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'CreateReel'> };

export default function CreateReelScreen({ navigation }: Props) {
  const composer = useMediaComposer({ kind: 'reel', navigation });
  const { state, config, isVideo, publishing, published } = composer;

  if (composer.editorVisible) return <ComposerEditor composer={composer} />;

  const busy = publishing || state.status === 'editing';

  const successActions = (
    <>
      {published?.id ? (
        <PressableScale
          onPress={() => {
            const postId = published.id;
            composer.exit(() => openReelsAtPost(navigation, postId, published));
          }}
          accessibilityRole="button"
          style={tw`w-full bg-brand-600 py-3.5 rounded-card items-center mb-3`}
        >
          <Text style={tw`text-white font-bold text-base`}>View in Reels</Text>
        </PressableScale>
      ) : null}
      <PressableScale
        onPress={() => composer.exit()}
        accessibilityRole="button"
        style={tw`w-full py-3.5 rounded-card items-center border border-white/25`}
      >
        <Text style={tw`text-white font-semibold`}>Done</Text>
      </PressableScale>
    </>
  );

  return (
    <ComposerShell
      title={config.title}
      onClose={composer.requestClose}
      closeDisabled={publishing}
      footer={
        state.media ? (
          <ComposerStickyBar
            category={{
              selected: state.category,
              hasCategories: composer.userCategories.length > 0,
              onOpen: () => composer.setCategorySheetOpen(true),
            }}
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
      overlay={
        state.status === 'success' ? (
          <PublishingOverlay
            variant="success"
            body="Your clip is in the feed. Open Reels to watch and scroll more."
            actions={successActions}
          />
        ) : null
      }
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
          <ComposerMediaStage composer={composer} badge={isVideo ? 'Video' : null} />
          <ToolChipRow
            chips={[
              {
                key: 'edit',
                icon: isVideo ? 'cut-outline' : 'color-wand-outline',
                label: 'Edit',
                accessibilityLabel: isVideo ? 'Edit clip' : 'Edit photo',
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

      <CategoryPicker
        visible={composer.categorySheetOpen}
        onClose={() => composer.setCategorySheetOpen(false)}
        userCategories={composer.userCategories}
        selectedCategory={state.category}
        onSelectCategory={composer.setCategory}
      />

      <ReelCameraCapture
        visible={composer.cameraOpen}
        onClose={() => composer.setCameraOpen(false)}
        onCaptured={composer.onCameraCaptured}
      />
    </ComposerShell>
  );
}
