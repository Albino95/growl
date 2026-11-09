import React from 'react';
import { View, Text, Pressable } from 'react-native';
import tw from '../../lib/tw';

type Props = {
  children: React.ReactNode;
  onClose: () => void;
};

type State = { failed: boolean };

/** Keep a composer alive if PhotoEditor / VideoEditor throw on open. */
export default class EditorErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[EditorErrorBoundary]', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={tw`flex-1 bg-black items-center justify-center px-8`}>
        <Text style={tw`text-white text-lg font-bold text-center mb-2`}>Couldn’t open the editor</Text>
        <Text style={tw`text-stone-400 text-sm text-center mb-6`}>
          Your photo or clip is still here. Close and try Edit again.
        </Text>
        <Pressable
          onPress={() => {
            this.setState({ failed: false });
            this.props.onClose();
          }}
          style={tw`bg-brand-600 px-6 py-3 rounded-full`}
        >
          <Text style={tw`text-white font-bold`}>Back to draft</Text>
        </Pressable>
      </View>
    );
  }
}
