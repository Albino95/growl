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
  /** Pre-edit snapshots for optimistic edits (rolled back on failure). */
  editSnapshots: Record<string, JournalEntry>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

const initialState: JournalState = {
  entries: [],
  editSnapshots: {},
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

export type AddJournalEntryArg = CreateJournalEntryRequest & {
  /** Stable per compose session so a retried save never creates a duplicate. */
  idempotencyKey?: string;
};

export const addJournalEntry = createAsyncThunk(
  'journal/addEntry',
  async ({ idempotencyKey, ...payload }: AddJournalEntryArg) => {
    const response = await createJournalEntry(payload, { idempotencyKey });
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

/** Local view of an entry after an edit (mirrors the server's update semantics). */
export function applyEntryPatch(entry: JournalEntry, patch: UpdateJournalEntryRequest): JournalEntry {
  const next: JournalEntry = { ...entry, updated_at: new Date().toISOString() };
  if (patch.content !== undefined) next.content = patch.content;
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.mood !== undefined) next.mood = patch.mood;
  if (patch.tags !== undefined) next.tags = patch.tags;
  if (patch.metadata !== undefined) next.metadata = patch.metadata;
  if (patch.is_public !== undefined) {
    next.is_public = patch.is_public;
    next.isPublic = patch.is_public;
  }
  return next;
}

const journalSlice = createSlice({
  name: 'journal',
  initialState,
  reducers: {
    clearJournalError: (state) => {
      state.error = null;
    },
    clearJournalEntries: (state) => {
      state.entries = [];
      state.editSnapshots = {};
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

    // Edits are optimistic: patch the row now, roll back if the server says no.
    builder
      .addCase(editJournalEntry.pending, (state, action) => {
        const { entryId, payload } = action.meta.arg;
        const idx = state.entries.findIndex((e) => e.id === entryId);
        if (idx < 0) return;
        const prev = state.entries[idx];
        if (!state.editSnapshots[entryId]) state.editSnapshots[entryId] = { ...prev };
        state.entries[idx] = applyEntryPatch(prev, payload);
      })
      .addCase(editJournalEntry.fulfilled, (state, action) => {
        const entryId = action.meta.arg.entryId;
        delete state.editSnapshots[entryId];
        const idx = state.entries.findIndex((e) => e.id === entryId);
        if (idx >= 0) state.entries[idx] = { ...state.entries[idx], ...action.payload };
      })
      .addCase(editJournalEntry.rejected, (state, action) => {
        const entryId = action.meta.arg.entryId;
        const snapshot = state.editSnapshots[entryId];
        delete state.editSnapshots[entryId];
        if (snapshot) {
          const idx = state.entries.findIndex((e) => e.id === entryId);
          if (idx >= 0) state.entries[idx] = snapshot;
        }
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
