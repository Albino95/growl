import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import GrowImage from '../ui/GrowImage';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import HighlightText from './HighlightText';
import { SuggestedChips, type SuggestedChip } from './RecentSearches';
import { resolvePostMediaUri } from '../../utils/images';
import { getCategoryLabel, getCategoryMeta } from '../../utils/categoryLabels';
import type { SearchPerson, SearchPost, SearchResult, SearchTag } from '../../services/api/search';
import type { SeeAllState, SeeAllType } from './useExploreSearch';

type Props = {
  query: string;
  result: SearchResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  seeAll: SeeAllState | null;
  onSeeAll: (type: SeeAllType) => void;
  onCloseSeeAll: () => void;
  onLoadMore: () => void;
  onRetrySeeAll: () => void;
  onOpenPerson: (p: SearchPerson) => void;
  onOpenPost: (p: SearchPost) => void;
  onOpenTag: (tag: string) => void;
  /** Trailing control on a person row (friend request button / status). */
  renderPersonAction?: (p: SearchPerson) => React.ReactNode;
  suggestions: SuggestedChip[];
  onPickSuggestion: (q: string) => void;
  onClear: () => void;
  /** Extra section under the results (e.g. local shop matches). */
  footer?: React.ReactNode;
  /** Whether `footer` has anything in it (counts toward "no results"). */
  footerHasResults?: boolean;
};

const SECTION_TITLE: Record<SeeAllType, string> = { people: 'People', posts: 'Posts', tags: 'Tags' };

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={tw`flex-row items-end justify-between mb-2 mt-1`} accessibilityRole="header">
      <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>{title}</Text>
      {onSeeAll ? (
        <PressableScale
          onPress={onSeeAll}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`See all ${title.toLowerCase()}`}
        >
          <Text style={tw`text-footnote font-semibold text-emerald-700`}>See all</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function PersonRow({
  person,
  query,
  onOpen,
  action,
}: {
  person: SearchPerson;
  query: string;
  onOpen: () => void;
  action?: React.ReactNode;
}) {
  // Group sub-paths under their parent so "Mindset" isn't repeated:
  // ["mindset:stress", "mindset:positive"] → "Mindset · Stress Management, Positive Thinking".
  const paths = (() => {
    const groups = new Map<string, string[]>();
    for (const p of person.paths.slice(0, 3)) {
      const m = getCategoryMeta(p);
      const subs = groups.get(m.parentLabel) ?? [];
      if (m.subLabel && !subs.includes(m.subLabel)) subs.push(m.subLabel);
      groups.set(m.parentLabel, subs);
    }
    return [...groups.entries()]
      .slice(0, 2)
      .map(([parent, subs]) => (subs.length ? `${parent} · ${subs.join(', ')}` : parent))
      .join(' · ');
  })();
  const showHandle = person.display_name && person.display_name !== person.username;
  return (
    <View style={tw`flex-row items-center bg-card border border-line/80 rounded-card px-3 py-2.5 mb-2`}>
      <PressableScale
        onPress={onOpen}
        style={tw`flex-row items-center flex-1`}
        accessibilityRole="button"
        accessibilityLabel={`Open ${person.display_name || person.username}'s profile`}
      >
        <GrowAvatar userId={person.id} username={person.username} uri={person.avatar_url} size={44} style={tw`mr-3`} />
        <View style={tw`flex-1`}>
          <HighlightText
            text={showHandle ? person.display_name : person.username}
            query={query}
            style={tw`text-body font-semibold text-ink`}
            numberOfLines={1}
          />
          <HighlightText
            text={[showHandle ? `@${person.username}` : null, person.is_friend ? 'Friend' : null, paths || null]
              .filter(Boolean)
              .join(' · ')}
            query={query}
            style={tw`text-footnote text-ink-3 mt-0.5`}
            numberOfLines={1}
          />
        </View>
      </PressableScale>
      {action}
    </View>
  );
}

function PostTile({ post, query, onOpen }: { post: SearchPost; query: string; onOpen: () => void }) {
  const image = resolvePostMediaUri(post.thumb_url, post.category, post.id);
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Post by ${post.author.username}${post.caption_snippet ? `: ${post.caption_snippet}` : ''}`}
      style={tw`w-[48%] mb-3 rounded-card overflow-hidden border border-line/80 bg-card`}
    >
      {image ? (
        <GrowImage source={{ uri: image }} style={tw`w-full h-36 bg-raised`} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={tw`w-full h-36 bg-raised items-center justify-center`}>
          <Ionicons name="image-outline" size={22} color={theme.colors.iconMuted} />
        </View>
      )}
      <View style={tw`p-2.5`}>
        {post.caption_snippet ? (
          <HighlightText
            text={post.caption_snippet}
            query={query}
            style={tw`text-footnote text-ink-2`}
            numberOfLines={2}
          />
        ) : null}
        <Text style={tw`text-caption text-ink-3 mt-1`} numberOfLines={1}>
          @{post.author.username}
        </Text>
      </View>
    </PressableScale>
  );
}

function TagRow({ tag, query, onOpen }: { tag: SearchTag; query: string; onOpen: () => void }) {
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Hashtag ${tag.tag}, ${tag.count} post${tag.count === 1 ? '' : 's'}`}
      style={tw`flex-row items-center py-2.5 border-b border-line/60`}
    >
      <View style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center mr-3`}>
        <Text style={tw`text-callout font-bold text-emerald-700`}>#</Text>
      </View>
      <HighlightText text={tag.tag} query={query} style={tw`flex-1 text-body text-ink`} numberOfLines={1} />
      <Text style={tw`text-footnote text-ink-3`}>
        {tag.count} post{tag.count === 1 ? '' : 's'}
      </Text>
    </PressableScale>
  );
}

function LoadingBones() {
  return (
    <View accessibilityLabel="Searching" accessible>
      {[0, 1, 2].map((i) => (
        <View key={i} style={tw`flex-row items-center mb-3`}>
          <Skeleton style={tw`w-11 h-11 rounded-full mr-3`} />
          <View style={tw`flex-1`}>
            <Skeleton style={tw`h-3 w-32 rounded mb-2`} />
            <Skeleton style={tw`h-3 w-20 rounded`} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Search results for Explore: People / Posts / Tags with "See all", or one full section. */
export default function SearchResults(props: Props) {
  const {
    query,
    result,
    loading,
    error,
    onRetry,
    seeAll,
    onSeeAll,
    onCloseSeeAll,
    onLoadMore,
    onRetrySeeAll,
    onOpenPerson,
    onOpenPost,
    onOpenTag,
    renderPersonAction,
    suggestions,
    onPickSuggestion,
    onClear,
    footer,
    footerHasResults,
  } = props;

  const renderSection = (type: SeeAllType, r: SearchResult, q: string) => {
    if (type === 'people') {
      return r.people.map((p) => (
        <PersonRow key={p.id} person={p} query={q} onOpen={() => onOpenPerson(p)} action={renderPersonAction?.(p)} />
      ));
    }
    if (type === 'posts') {
      return (
        <View style={tw`flex-row flex-wrap justify-between`}>
          {r.posts.map((p) => (
            <PostTile key={p.id} post={p} query={q} onOpen={() => onOpenPost(p)} />
          ))}
        </View>
      );
    }
    return r.tags.map((t) => <TagRow key={t.tag} tag={t} query={q} onOpen={() => onOpenTag(t.tag)} />);
  };

  // --- One section, paged ("See all") ---
  if (seeAll) {
    const r = seeAll.result;
    const count = r ? (seeAll.type === 'people' ? r.people.length : seeAll.type === 'posts' ? r.posts.length : r.tags.length) : 0;
    return (
      <View>
        <PressableScale
          onPress={onCloseSeeAll}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to all results"
          style={tw`flex-row items-center mb-3`}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.brand} />
          <Text style={tw`text-footnote font-semibold text-emerald-700 ml-1`}>All results</Text>
        </PressableScale>
        <SectionHeader title={SECTION_TITLE[seeAll.type]} />
        {r && count > 0 ? renderSection(seeAll.type, r, seeAll.query) : null}
        {seeAll.loading ? (
          r ? (
            <ActivityIndicator style={tw`my-4`} color={theme.colors.brand} />
          ) : (
            <LoadingBones />
          )
        ) : seeAll.error ? (
          <ErrorState compact message={seeAll.error} onRetry={onRetrySeeAll} />
        ) : seeAll.cursor ? (
          <PressableScale
            onPress={onLoadMore}
            accessibilityRole="button"
            accessibilityLabel={`Show more ${SECTION_TITLE[seeAll.type].toLowerCase()}`}
            style={tw`items-center py-3 my-2 rounded-control border border-line bg-card`}
          >
            <Text style={tw`text-footnote font-semibold text-ink-2`}>Show more</Text>
          </PressableScale>
        ) : r && count === 0 ? (
          <Text style={tw`text-footnote text-ink-3 my-4`}>Nothing more here.</Text>
        ) : null}
      </View>
    );
  }

  // --- Overview ---
  if (error && !result) {
    return <ErrorState compact title="Search didn’t go through" message={error} onRetry={onRetry} />;
  }
  if (!result) return loading ? <LoadingBones /> : null;

  const q = query.trim();
  const isTag = q.startsWith('#');
  const hasAny = result.people.length + result.posts.length + result.tags.length > 0 || !!footerHasResults;

  return (
    <View style={loading ? tw`opacity-60` : undefined}>
      {result.tags.length > 0 && isTag ? (
        <View style={tw`mb-5`}>
          <SectionHeader title="Tags" onSeeAll={result.more.tags ? () => onSeeAll('tags') : undefined} />
          {renderSection('tags', result, q)}
        </View>
      ) : null}
      {result.people.length > 0 ? (
        <View style={tw`mb-5`}>
          <SectionHeader title="People" onSeeAll={result.more.people ? () => onSeeAll('people') : undefined} />
          {renderSection('people', result, q)}
        </View>
      ) : null}
      {result.posts.length > 0 ? (
        <View style={tw`mb-3`}>
          <SectionHeader title="Posts" onSeeAll={result.more.posts ? () => onSeeAll('posts') : undefined} />
          {renderSection('posts', result, q)}
        </View>
      ) : null}
      {result.tags.length > 0 && !isTag ? (
        <View style={tw`mb-5`}>
          <SectionHeader title="Tags" onSeeAll={result.more.tags ? () => onSeeAll('tags') : undefined} />
          {renderSection('tags', result, q)}
        </View>
      ) : null}
      {footer}
      {!hasAny && !loading ? (
        <View>
          <EmptyState
            icon="search-outline"
            title={`Nothing for “${q}” yet`}
            description={
              isTag
                ? 'No posts use this tag yet. Try a broader word, or add it to your next post so others can find it.'
                : 'Try a shorter word, check the spelling, or start a name with its first letters. A path below is a good place to wander.'
            }
            actionLabel={isTag ? `Search “${q.replace(/^#+/, '')}” instead` : 'Clear search'}
            onAction={isTag ? () => onPickSuggestion(q.replace(/^#+/, '')) : onClear}
          />
          <SuggestedChips suggestions={suggestions} onPick={onPickSuggestion} title="Browse a path" />
        </View>
      ) : null}
    </View>
  );
}
