import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  getJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  type JournalEntry,
  type CreateJournalEntryRequest,
  type UpdateJournalEntryRequest,
  type JournalMood,
} from '../../services/api/journal';

export type { JournalEntry, JournalMood };

interface JournalState {
  entries: JournalEntry[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

const initialState: JournalState = {
  entries: [],
  isLoading: false,
  isSaving: false,
  error: null,
};

export const fetchJournalEntries = createAsyncThunk(
  'journal/fetchEntries',
  async (_arg?: void) => {
    // Own practice log (private + shared). Public discovery lives on profiles.
    const response = await getJournalEntries({ scope: 'mine', limit: 100 });
    if (response.success && response.data?.entries) {
      return response.data.entries;
    }
    throw new Error('Failed to fetch journal entries');
  }
);

export const addJournalEntry = createAsyncThunk(
  'journal/addEntry',
  async (payload: CreateJournalEntryRequest) => {
    const response = await createJournalEntry(payload);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error('Failed to create journal entry');
  }
);

export const editJournalEntry = createAsyncThunk(
  'journal/editEntry',
  async ({ entryId, payload }: { entryId: string; payload: UpdateJournalEntryRequest }) => {
    const response = await updateJournalEntry(entryId, payload);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error('Failed to update journal entry');
  }
);

export const removeJournalEntry = createAsyncThunk(
  'journal/removeEntry',
  async (entryId: string) => {
    const response = await deleteJournalEntry(entryId);
    if (response.success) {
      return entryId;
    }
    throw new Error('Failed to delete journal entry');
  }
);

const journalSlice = createSlice({
  name: 'journal',
  initialState,
  reducers: {
    clearJournalError: (state) => {
      state.error = null;
    },
    clearJournalEntries: (state) => {
      state.entries = [];
      state.isLoading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJournalEntries.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchJournalEntries.fulfilled, (state, action: PayloadAction<JournalEntry[]>) => {
        state.entries = action.payload;
        state.isLoading = false;
      })
      .addCase(fetchJournalEntries.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch journal entries';
      });

    builder
      .addCase(addJournalEntry.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(addJournalEntry.fulfilled, (state, action: PayloadAction<JournalEntry>) => {
        state.entries = [action.payload, ...state.entries];
        state.isSaving = false;
      })
      .addCase(addJournalEntry.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.error.message || 'Failed to create journal entry';
      });

    builder
      .addCase(editJournalEntry.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(editJournalEntry.fulfilled, (state, action: PayloadAction<JournalEntry>) => {
        const idx = state.entries.findIndex((e) => e.id === action.payload.id);
        if (idx >= 0) state.entries[idx] = action.payload;
        state.isSaving = false;
      })
      .addCase(editJournalEntry.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.error.message || 'Failed to update journal entry';
      });

    builder
      .addCase(removeJournalEntry.fulfilled, (state, action: PayloadAction<string>) => {
        state.entries = state.entries.filter((e) => e.id !== action.payload);
      })
      .addCase(removeJournalEntry.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to delete journal entry';
      });
  },
});

export const { clearJournalError, clearJournalEntries } = journalSlice.actions;
export default journalSlice.reducer;
