import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useMediaComposer } from '../../hooks/useMediaComposer';
import { useAuth } from '../../store/hooks';
import ComposerShell from '../../components/composer/ComposerShell';
import ComposerEditor from '../../components/composer/ComposerEditor';
import ComposerMediaStage from '../../components/composer/ComposerMediaStage';
import ComposerCaption from '../../components/composer/ComposerCaption';
import ComposerStickyBar from '../../components/composer/ComposerStickyBar';
import CategoryPicker from '../../components/composer/CategoryPicker';
import MediaSourcePicker from '../../components/composer/MediaSourcePicker';
import PublishingOverlay from '../../components/composer/PublishingOverlay';
import ToolChipRow, { type ToolChip } from '../../components/composer/ToolChipRow';
import PostMusicSheet from './components/PostMusicSheet';
import { MUSIC_PLAYBACK_SUPPORTED } from '../../utils/mediaCapabilities';
import tw from '../../lib/tw';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Post'>;
};

export default function PostScreen({ navigation }: Props) {
  const route = useRoute<RouteProp<RootStackParamList, 'Post'>>();
  const params = route.params;
  const { user } = useAuth();
  const [musicOpen, setMusicOpen] = useState(false);

  const postExtras = useMemo(
    () => ({
      productId: params?.productId,
      promoteBusinessId: params?.promoteBusinessId,
      promoteBusinessName: params?.promoteBusinessName,
      referralInstructorId: user?.isInstructor ? user.id : undefined,
    }),
    [params?.productId, params?.promoteBusinessId, params?.promoteBusinessName, user?.isInstructor, user?.id]
  );

  const composer = useMediaComposer({
    kind: 'post',
    navigation,
    initialCaption: params?.caption,
    initialCategory: params?.category,
    postExtras,
  });
  const { state, config, publishing } = composer;

  if (composer.editorVisible) return <ComposerEditor composer={composer} />;

  const busy = publishing || state.status === 'editing';
  const promoteName = params?.promoteBusinessName;
  const openMusic = MUSIC_PLAYBACK_SUPPORTED ? () => setMusicOpen(true) : undefined;

  const chips: ToolChip[] = [
    {
      key: 'edit',
      icon: 'color-wand-outline',
      label: 'Edit',
      accessibilityLabel: 'Edit photo',
      onPress: composer.openEditor,
      disabled: busy,
    },
  ];
  if (openMusic) {
    chips.push({
      key: 'music',
      icon: 'musical-notes-outline',
      label: 'Music',
      onPress: openMusic,
      active: Boolean(state.audio),
      disabled: busy,
    });
  }
  chips.push(
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
    }
  );

  return (
    <ComposerShell
      title={promoteName ? 'Promote' : config.title}
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
            music={openMusic ? { title: state.audio?.title ?? null, onOpen: openMusic } : undefined}
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
      {promoteName ? (
        <View
          style={tw`mx-gutter mb-2 px-3.5 py-2.5 rounded-card bg-emerald-600/95 border border-emerald-500/40`}
          accessibilityRole="text"
        >
          <Text style={tw`text-caption font-semibold tracking-widest text-[#D1FAE5] uppercase`}>
            Partnership
          </Text>
          <Text style={tw`text-sm font-bold text-white mt-0.5`} numberOfLines={1}>
            Promoting {promoteName}
          </Text>
        </View>
      ) : null}

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
          <ComposerMediaStage composer={composer} />
          <ToolChipRow chips={chips} />
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

      {openMusic ? (
        <PostMusicSheet
          visible={musicOpen}
          onClose={() => setMusicOpen(false)}
          selectedTrack={state.audio}
          onSelectTrack={composer.setAudio}
        />
      ) : null}
    </ComposerShell>
  );
}
