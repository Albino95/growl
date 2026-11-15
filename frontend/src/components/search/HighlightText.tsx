import React, { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import tw from '../../lib/tw';
import { highlightSegments } from './highlight';

type Props = {
  text: string;
  query: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

/** Text with the words that matched the search in bold. */
export default function HighlightText({ text, query, style, numberOfLines }: Props) {
  const segments = useMemo(() => highlightSegments(text, query), [text, query]);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((s, i) =>
        s.match ? (
          <Text key={i} style={tw`font-bold text-ink`}>
            {s.text}
          </Text>
        ) : (
          s.text
        )
      )}
    </Text>
  );
}
