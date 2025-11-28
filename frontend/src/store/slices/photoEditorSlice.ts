import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type FilterType = 'none' | 'vintage' | 'blackwhite' | 'sepia' | 'cool' | 'warm' | 'dramatic' | 'bright' | 'clarity' | 'vibrant';

interface PhotoEditorState {
  editedImage: string | null;
  currentFilter: FilterType;
  brightness: number;
  contrast: number;
  saturation: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  isProcessing: boolean;
}

const initialState: PhotoEditorState = {
  editedImage: null,
  currentFilter: 'none',
  brightness: 1,
  contrast: 1,
  saturation: 1,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  isProcessing: false,
};

const photoEditorSlice = createSlice({
  name: 'photoEditor',
  initialState,
  reducers: {
    setEditedImage: (state, action: PayloadAction<string>) => {
      state.editedImage = action.payload;
    },
    setFilter: (state, action: PayloadAction<FilterType>) => {
      state.currentFilter = action.payload;
    },
    setBrightness: (state, action: PayloadAction<number>) => {
      state.brightness = action.payload;
    },
    setContrast: (state, action: PayloadAction<number>) => {
      state.contrast = action.payload;
    },
    setSaturation: (state, action: PayloadAction<number>) => {
      state.saturation = action.payload;
    },
    rotate: (state) => {
      state.rotation = (state.rotation + 90) % 360;
    },
    flipHorizontal: (state) => {
      state.flipHorizontal = !state.flipHorizontal;
    },
    flipVertical: (state) => {
      state.flipVertical = !state.flipVertical;
    },
    setProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload;
    },
    resetAdjustments: (state) => {
      state.brightness = 1;
      state.contrast = 1;
      state.saturation = 1;
      state.currentFilter = 'none';
    },
    resetEditor: (state) => {
      return initialState;
    },
    initializeEditor: (state, action: PayloadAction<string>) => {
      state.editedImage = action.payload;
      state.currentFilter = 'none';
      state.rotation = 0;
      state.flipHorizontal = false;
      state.flipVertical = false;
      state.brightness = 1;
      state.contrast = 1;
      state.saturation = 1;
    },
  },
});

export const {
  setEditedImage,
  setFilter,
  setBrightness,
  setContrast,
  setSaturation,
  rotate,
  flipHorizontal,
  flipVertical,
  setProcessing,
  resetAdjustments,
  resetEditor,
  initializeEditor,
} = photoEditorSlice.actions;

export default photoEditorSlice.reducer;

