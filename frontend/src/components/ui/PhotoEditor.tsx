import React, { useReducer, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Alert, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import tw from '../../lib/tw';

type FilterType = 'none' | 'vintage' | 'blackwhite' | 'sepia' | 'cool' | 'warm' | 'dramatic' | 'bright' | 'clarity' | 'vibrant';

interface PhotoEditorProps {
  imageUri: string;
  onSave: (editedUri: string) => void;
  onCancel: () => void;
}

interface FilterConfig {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  blur?: number;
}

/**
 * Record<K, V> is a built-in TypeScript utility type.
 * It creates an object type with keys of type K and values of type V.
 * No import needed - it's part of TypeScript's standard library!
 * 
 * Example: Record<string, number> = { [key: string]: number }
 */
const filterConfigs: Record<FilterType, FilterConfig> = {
  none: {},
  vintage: { brightness: 0.9, contrast: 1.1, saturation: 0.8, hue: 10 },
  blackwhite: { brightness: 1, contrast: 1.2, saturation: 0 },
  sepia: { brightness: 0.95, contrast: 0.9, saturation: 0.5, hue: 20 },
  cool: { brightness: 1, contrast: 1, saturation: 1.1, hue: -10 },
  warm: { brightness: 1.05, contrast: 1, saturation: 1.2, hue: 15 },
  dramatic: { brightness: 0.85, contrast: 1.4, saturation: 1.1 },
  bright: { brightness: 1.2, contrast: 1.1, saturation: 1.1 },
  clarity: { brightness: 1, contrast: 1.3, saturation: 1.15 },
  vibrant: { brightness: 1, contrast: 1.1, saturation: 1.5 },
};

// State interface
interface PhotoEditorState {
  editedImage: string;
  currentFilter: FilterType;
  brightness: number;
  contrast: number;
  saturation: number;
  isProcessing: boolean;
  showAdjustments: boolean;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

// Action types
type PhotoEditorAction =
  | { type: 'SET_EDITED_IMAGE'; payload: string }
  | { type: 'SET_FILTER'; payload: FilterType }
  | { type: 'SET_BRIGHTNESS'; payload: number }
  | { type: 'SET_CONTRAST'; payload: number }
  | { type: 'SET_SATURATION'; payload: number }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'TOGGLE_ADJUSTMENTS' }
  | { type: 'ROTATE' }
  | { type: 'FLIP_HORIZONTAL' }
  | { type: 'FLIP_VERTICAL' }
  | { type: 'RESET_ADJUSTMENTS' }
  | { type: 'RESET_STATE'; payload: string };

// Initial state
const createInitialState = (imageUri: string): PhotoEditorState => ({
  editedImage: imageUri,
  currentFilter: 'none',
  brightness: 1,
  contrast: 1,
  saturation: 1,
  isProcessing: false,
  showAdjustments: false,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
});

// Reducer
const photoEditorReducer = (
  state: PhotoEditorState,
  action: PhotoEditorAction
): PhotoEditorState => {
  switch (action.type) {
    case 'SET_EDITED_IMAGE':
      return { ...state, editedImage: action.payload };
    
    case 'SET_FILTER':
      return { ...state, currentFilter: action.payload };
    
    case 'SET_BRIGHTNESS':
      return { ...state, brightness: action.payload };
    
    case 'SET_CONTRAST':
      return { ...state, contrast: action.payload };
    
    case 'SET_SATURATION':
      return { ...state, saturation: action.payload };
    
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    
    case 'TOGGLE_ADJUSTMENTS':
      return { ...state, showAdjustments: !state.showAdjustments };
    
    case 'ROTATE':
      return { ...state, rotation: (state.rotation + 90) % 360 };
    
    case 'FLIP_HORIZONTAL':
      return { ...state, flipHorizontal: !state.flipHorizontal };
    
    case 'FLIP_VERTICAL':
      return { ...state, flipVertical: !state.flipVertical };
    
    case 'RESET_ADJUSTMENTS':
      return {
        ...state,
        brightness: 1,
        contrast: 1,
        saturation: 1,
        currentFilter: 'none',
      };
    
    case 'RESET_STATE':
      return createInitialState(action.payload);
    
    default:
      return state;
  }
};

export default function PhotoEditor({ imageUri, onSave, onCancel }: PhotoEditorProps) {
  const [state, dispatch] = useReducer(photoEditorReducer, imageUri, createInitialState);
  const insets = useSafeAreaInsets();

  // Update state when imageUri changes
  useEffect(() => {
    if (imageUri !== state.editedImage) {
      dispatch({ type: 'RESET_STATE', payload: imageUri });
    }
  }, [imageUri]);

  const filters: { name: FilterType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { name: 'none', label: 'Original', icon: 'image-outline' },
    { name: 'vibrant', label: 'Vibrant', icon: 'color-palette-outline' },
    { name: 'bright', label: 'Bright', icon: 'sunny' },
    { name: 'clarity', label: 'Clarity', icon: 'sparkles-outline' },
    { name: 'dramatic', label: 'Dramatic', icon: 'flash-outline' },
    { name: 'vintage', label: 'Vintage', icon: 'film-outline' },
    { name: 'warm', label: 'Warm', icon: 'sunny-outline' },
    { name: 'cool', label: 'Cool', icon: 'snow-outline' },
    { name: 'sepia', label: 'Sepia', icon: 'camera-outline' },
    { name: 'blackwhite', label: 'B&W', icon: 'contrast-outline' },
  ];

  // Apply filter preset
  const applyFilter = useCallback(async (filter: FilterType) => {
    if (state.isProcessing) return;
    
    dispatch({ type: 'SET_FILTER', payload: filter });
    const filterConfig = filterConfigs[filter];
    
    // Update adjustment values to match filter preset
    if (filterConfig.brightness !== undefined) {
      dispatch({ type: 'SET_BRIGHTNESS', payload: filterConfig.brightness });
    }
    if (filterConfig.contrast !== undefined) {
      dispatch({ type: 'SET_CONTRAST', payload: filterConfig.contrast });
    }
    if (filterConfig.saturation !== undefined) {
      dispatch({ type: 'SET_SATURATION', payload: filterConfig.saturation });
    }
  }, [state.isProcessing]);

  // Rotate image
  const rotateImage = useCallback(async () => {
    dispatch({ type: 'SET_PROCESSING', payload: true });
    dispatch({ type: 'ROTATE' });
    
    try {
      const result = await ImageManipulator.manipulateAsync(
        state.editedImage,
        [{ rotate: 90 }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      dispatch({ type: 'SET_EDITED_IMAGE', payload: result.uri });
    } catch (error) {
      console.error('Error rotating image:', error);
      Alert.alert('Error', 'Failed to rotate image. Please try again.');
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  }, [state.editedImage]);

  // Flip horizontally
  const flipHorizontalImage = useCallback(async () => {
    dispatch({ type: 'SET_PROCESSING', payload: true });
    dispatch({ type: 'FLIP_HORIZONTAL' });
    
    try {
      const result = await ImageManipulator.manipulateAsync(
        state.editedImage,
        [{ flip: ImageManipulator.FlipType.Horizontal }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      dispatch({ type: 'SET_EDITED_IMAGE', payload: result.uri });
    } catch (error) {
      console.error('Error flipping image:', error);
      Alert.alert('Error', 'Failed to flip image. Please try again.');
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  }, [state.editedImage]);

  // Apply adjustments and save
  const handleSave = useCallback(async () => {
    dispatch({ type: 'SET_PROCESSING', payload: true });
    try {
      // Apply final transformations
      const actions: ImageManipulator.Action[] = [];
      
      if (state.rotation !== 0) {
        actions.push({ rotate: state.rotation });
      }
      if (state.flipHorizontal) {
        actions.push({ flip: ImageManipulator.FlipType.Horizontal });
      }
      if (state.flipVertical) {
        actions.push({ flip: ImageManipulator.FlipType.Vertical });
      }

      let finalImage = state.editedImage;
      if (actions.length > 0) {
        const result = await ImageManipulator.manipulateAsync(
          state.editedImage,
          actions,
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
        finalImage = result.uri;
      }

      // Note: Brightness/Contrast/Saturation are applied via CSS filters for preview
      // For native platforms, these would need to be applied via image processing library
      // The saved image will have transformations (rotate/flip) but filter adjustments
      // are visual previews only on native (they work fully on web)
      onSave(finalImage);
    } catch (error) {
      console.error('Error saving image:', error);
      Alert.alert('Error', 'Failed to save image. Please try again.');
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  }, [state.editedImage, state.rotation, state.flipHorizontal, state.flipVertical, onSave]);

  // Get filter style for preview (works on web and as visual preview)
  const getFilterStyle = useCallback((): object => {
    const config = filterConfigs[state.currentFilter];
    
    // On web, use CSS filters which work perfectly
    if (Platform.OS === 'web') {
      const filters: string[] = [];
      
      // Combine filter preset with manual adjustments
      const brightness = config.brightness !== undefined 
        ? config.brightness * state.brightness 
        : state.brightness;
      const contrast = config.contrast !== undefined 
        ? config.contrast * state.contrast 
        : state.contrast;
      const saturation = config.saturation !== undefined 
        ? config.saturation * state.saturation 
        : state.saturation;
      
      if (brightness !== 1) filters.push(`brightness(${brightness})`);
      if (contrast !== 1) filters.push(`contrast(${contrast})`);
      if (saturation !== 1) filters.push(`saturate(${saturation})`);
      if (config.hue) filters.push(`hue-rotate(${config.hue}deg)`);
      
      return { filter: filters.join(' ') };
    }
    
    // On native, provide visual preview (full implementation would require expo-gl or native module)
    // For now, show preview with opacity adjustments for black/white filter
    if (state.currentFilter === 'blackwhite' || state.saturation === 0) {
      return { opacity: 0.95 };
    }
    
    return {};
  }, [state.currentFilter, state.brightness, state.contrast, state.saturation]);

  // Reset adjustments
  const resetAdjustments = useCallback(() => {
    dispatch({ type: 'RESET_ADJUSTMENTS' });
  }, []);

  const toggleAdjustments = useCallback(() => {
    dispatch({ type: 'TOGGLE_ADJUSTMENTS' });
  }, []);

  return (
    <Modal visible={true} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={tw`flex-1 bg-black`} edges={['top', 'bottom']}>
        {/* Header - with proper safe area padding */}
        <View 
          style={[
            tw`flex-row items-center justify-between px-4 border-b border-gray-800`,
            { paddingTop: Math.max(insets.top, 8), paddingBottom: 12 }
          ]}
        >
          <TouchableOpacity 
            onPress={onCancel} 
            disabled={state.isProcessing}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={tw`text-white text-base font-medium`}>Cancel</Text>
          </TouchableOpacity>
          <Text style={tw`text-white text-lg font-semibold`}>Edit Photo</Text>
          <TouchableOpacity 
            onPress={handleSave} 
            disabled={state.isProcessing}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={tw`${state.isProcessing ? 'text-gray-500' : 'text-green-500'} text-base font-semibold`}>
              {state.isProcessing ? 'Processing...' : 'Done'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Image Preview */}
        <View style={tw`flex-1 items-center justify-center bg-black p-4`}>
          <View style={tw`relative w-full`}>
            <Image
              source={{ uri: state.editedImage }}
              style={[tw`w-full max-w-full h-96 rounded-lg`, getFilterStyle()]}
              contentFit="contain"
              transition={200}
            />
            {state.isProcessing && (
              <View style={tw`absolute inset-0 items-center justify-center bg-black bg-opacity-50 rounded-lg`}>
                <View style={tw`items-center`}>
                  <Text style={tw`text-white text-base mb-2`}>Processing...</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Adjustment Controls */}
        {state.showAdjustments && (
          <View style={[tw`bg-gray-900 px-4 py-4 border-t border-gray-800`, { maxHeight: 220 }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={tw`mb-4`}>
                <View style={tw`flex-row justify-between mb-3`}>
                  <Text style={tw`text-white text-sm font-medium`}>Brightness</Text>
                  <Text style={tw`text-gray-400 text-sm`}>{Math.round(state.brightness * 100)}%</Text>
                </View>
                <Slider
                  style={tw`w-full h-8`}
                  minimumValue={0.5}
                  maximumValue={1.5}
                  value={state.brightness}
                  onValueChange={(value) => dispatch({ type: 'SET_BRIGHTNESS', payload: value })}
                  minimumTrackTintColor="#10B981"
                  maximumTrackTintColor="#374151"
                  thumbTintColor="#10B981"
                  step={0.01}
                />
              </View>
              
              <View style={tw`mb-4`}>
                <View style={tw`flex-row justify-between mb-3`}>
                  <Text style={tw`text-white text-sm font-medium`}>Contrast</Text>
                  <Text style={tw`text-gray-400 text-sm`}>{Math.round(state.contrast * 100)}%</Text>
                </View>
                <Slider
                  style={tw`w-full h-8`}
                  minimumValue={0.5}
                  maximumValue={1.5}
                  value={state.contrast}
                  onValueChange={(value) => dispatch({ type: 'SET_CONTRAST', payload: value })}
                  minimumTrackTintColor="#10B981"
                  maximumTrackTintColor="#374151"
                  thumbTintColor="#10B981"
                  step={0.01}
                />
              </View>
              
              <View style={tw`mb-2`}>
                <View style={tw`flex-row justify-between mb-3`}>
                  <Text style={tw`text-white text-sm font-medium`}>Saturation</Text>
                  <Text style={tw`text-gray-400 text-sm`}>{Math.round(state.saturation * 100)}%</Text>
                </View>
                <Slider
                  style={tw`w-full h-8`}
                  minimumValue={0}
                  maximumValue={2}
                  value={state.saturation}
                  onValueChange={(value) => dispatch({ type: 'SET_SATURATION', payload: value })}
                  minimumTrackTintColor="#10B981"
                  maximumTrackTintColor="#374151"
                  thumbTintColor="#10B981"
                  step={0.01}
                />
              </View>
              
              <TouchableOpacity 
                onPress={resetAdjustments}
                style={tw`mt-3 bg-gray-800 rounded-lg py-2.5 px-4 self-center`}
              >
                <Text style={tw`text-white text-sm font-medium`}>Reset</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Toolbar */}
        <View style={[tw`bg-gray-900 px-4 border-t border-gray-800`, { paddingBottom: Math.max(insets.bottom, 12), paddingTop: 12 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-3`}>
            <TouchableOpacity
              onPress={rotateImage}
              style={tw`items-center justify-center mr-6`}
              disabled={state.isProcessing}
            >
              <View style={tw`w-12 h-12 rounded-full bg-gray-800 items-center justify-center mb-1`}>
                <Ionicons name="refresh" size={24} color="#FFFFFF" />
              </View>
              <Text style={tw`text-white text-xs mt-1`}>Rotate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={flipHorizontalImage}
              style={tw`items-center justify-center mr-6`}
              disabled={state.isProcessing}
            >
              <View style={tw`w-12 h-12 rounded-full bg-gray-800 items-center justify-center mb-1`}>
                <Ionicons name="swap-horizontal" size={24} color="#FFFFFF" />
              </View>
              <Text style={tw`text-white text-xs mt-1`}>Flip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={toggleAdjustments}
              style={tw`items-center justify-center mr-6`}
            >
              <View style={tw`w-12 h-12 rounded-full ${state.showAdjustments ? 'bg-green-600' : 'bg-gray-800'} items-center justify-center mb-1`}>
                <Ionicons name="options" size={24} color="#FFFFFF" />
              </View>
              <Text style={tw`text-white text-xs mt-1`}>Adjust</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter.name}
                onPress={() => applyFilter(filter.name)}
                style={tw`items-center justify-center mr-4`}
                disabled={state.isProcessing}
              >
                <View
                  style={tw`w-16 h-16 rounded-lg bg-gray-800 items-center justify-center mb-1 border-2 ${
                    state.currentFilter === filter.name ? 'border-green-500' : 'border-transparent'
                  }`}
                >
                  <Ionicons 
                    name={filter.icon} 
                    size={28} 
                    color={state.currentFilter === filter.name ? '#10B981' : '#FFFFFF'} 
                  />
                </View>
                <Text style={tw`text-white text-xs`}>{filter.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
