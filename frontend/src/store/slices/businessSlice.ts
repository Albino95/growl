import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import {
  getDashboard,
  getBusinessTimeseries,
  getBusinessFunnel,
  getBusinessTopProducts,
  getBusinessProducts,
  getBusinessOrders,
  getPartnerships,
  getPartnershipDiscover,
  getPartnershipPerformance,
  getBusinessSettings,
  listCampaigns,
  getBusinessCustomers,
  getBusinessNotifications,
  listPromoCodes,
  type BusinessPeriod,
  type DashboardKPIs,
  type TimeseriesPoint,
  type OrderFunnel,
  type BusinessProduct,
  type PartnershipRecord,
  type PartnershipRequestRecord,
  type DiscoverInstructor,
  type BusinessSettings,
  type MarketingCampaign,
  type BusinessCustomer,
  type BusinessNotification,
  type PromoCode,
} from '../../services/api/business';
import type { Order } from '../../services/api/marketplace';

export type BusinessLoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type FetchBusinessArgs = {
  period?: BusinessPeriod;
  force?: boolean;
  silent?: boolean;
};

type TopProduct = { id: string; name: string; image_url?: string; units_sold: number; revenue: number };

type PartnerPerf = {
  id: string;
  instructor_id: string;
  instructor_name: string;
  instructor_avatar?: string | null;
  categories: string[];
  partnership_type: string;
  commission_rate?: number | null;
  fixed_fee?: number | null;
  status: string;
  attributed_revenue: number;
};

interface BusinessState {
  period: BusinessPeriod;
  kpis: DashboardKPIs | null;
  timeseries: TimeseriesPoint[];
  funnel: OrderFunnel | null;
  topProducts: TopProduct[];
  products: BusinessProduct[];
  orders: Order[];
  partnerships: PartnershipRecord[];
  partnershipRequests: PartnershipRequestRecord[];
  discoverInstructors: DiscoverInstructor[];
  partnershipPerformance: PartnerPerf[];
  settings: BusinessSettings | null;
  campaigns: MarketingCampaign[];
  customers: BusinessCustomer[];
  notifications: BusinessNotification[];
  promoCodes: PromoCode[];
  unreadNotificationCount: number;
  status: BusinessLoadStatus;
  productsStatus: BusinessLoadStatus;
  ordersStatus: BusinessLoadStatus;
  growStatus: BusinessLoadStatus;
  error: string | null;
  lastFetchedAt: string | null;
  catalogFilter: 'all' | 'low' | 'out';
  ordersFilter: string;
}

const initialState: BusinessState = {
  period: 'week',
  kpis: null,
  timeseries: [],
  funnel: null,
  topProducts: [],
  products: [],
  orders: [],
  partnerships: [],
  partnershipRequests: [],
  discoverInstructors: [],
  partnershipPerformance: [],
  settings: null,
  campaigns: [],
  customers: [],
  notifications: [],
  promoCodes: [],
  unreadNotificationCount: 0,
  status: 'idle',
  productsStatus: 'idle',
  ordersStatus: 'idle',
  growStatus: 'idle',
  error: null,
  lastFetchedAt: null,
  catalogFilter: 'all',
  ordersFilter: 'all',
};

const STALE_MS = 40_000;

export const fetchBusinessDashboard = createAsyncThunk(
  'business/fetchDashboard',
  async (args: FetchBusinessArgs | undefined, { getState, rejectWithValue }) => {
    const period =
      args?.period || (getState() as { business: BusinessState }).business.period || 'week';
    try {
      const [dash, series, funnel, top] = await Promise.all([
        getDashboard(period),
        getBusinessTimeseries(period),
        getBusinessFunnel(period),
        getBusinessTopProducts(period),
      ]);
      if (!dash.success || !dash.data?.kpis) {
        return rejectWithValue('Unexpected dashboard response');
      }
      return {
        period,
        kpis: dash.data.kpis,
        timeseries: series.data?.series || [],
        funnel: funnel.data?.funnel || null,
        topProducts: top.data?.products || [],
      };
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load dashboard');
    }
  },
  {
    condition: (args, { getState }) => {
      if (args?.force) return true;
      const state = (getState() as { business: BusinessState }).business;
      if (state.status === 'loading') return false;
      if (args?.period && args.period !== state.period) return true;
      if (state.lastFetchedAt && state.kpis) {
        const age = Date.now() - new Date(state.lastFetchedAt).getTime();
        if (age < STALE_MS) return false;
      }
      return true;
    },
  }
);

export const fetchBusinessProducts = createAsyncThunk(
  'business/fetchProducts',
  async (_: void, { rejectWithValue }) => {
    try {
      const res = await getBusinessProducts('month');
      if (!res.success) return rejectWithValue('Failed to load products');
      return res.data.products || [];
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load products');
    }
  }
);

export const fetchBusinessOrders = createAsyncThunk(
  'business/fetchOrders',
  async (_: void, { rejectWithValue }) => {
    try {
      const res = await getBusinessOrders();
      if (!res.success) return rejectWithValue('Failed to load orders');
      return res.data || [];
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load orders');
    }
  }
);

export const fetchBusinessGrow = createAsyncThunk(
  'business/fetchGrow',
  async (_: void, { rejectWithValue }) => {
    try {
      const [partners, discover, perf, campaigns] = await Promise.all([
        getPartnerships(),
        getPartnershipDiscover(),
        getPartnershipPerformance(),
        listCampaigns().catch(() => ({ success: true as const, data: { campaigns: [] as MarketingCampaign[] } })),
      ]);
      return {
        partnerships: partners.data?.partnerships || [],
        requests: partners.data?.requests || [],
        discover: discover.data?.instructors || [],
        performance: perf.data?.partnerships || [],
        campaigns: campaigns.data?.campaigns || [],
      };
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load grow data');
    }
  }
);

export const fetchBusinessSettings = createAsyncThunk(
  'business/fetchSettings',
  async (_: void, { rejectWithValue }) => {
    try {
      const res = await getBusinessSettings();
      if (!res.success) return rejectWithValue('Failed to load settings');
      return res.data;
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load settings');
    }
  }
);

export const fetchCustomers = createAsyncThunk(
  'business/fetchCustomers',
  async (_: void, { rejectWithValue }) => {
    try {
      const res = await getBusinessCustomers();
      return res.customers || [];
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load customers');
    }
  }
);

export const fetchNotifications = createAsyncThunk(
  'business/fetchNotifications',
  async (_: void, { rejectWithValue }) => {
    try {
      const res = await getBusinessNotifications();
      return res.notifications || [];
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load notifications');
    }
  }
);

export const fetchPromoCodes = createAsyncThunk(
  'business/fetchPromoCodes',
  async (_: void, { rejectWithValue }) => {
    try {
      const res = await listPromoCodes();
      return res.promo_codes || [];
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to load promo codes');
    }
  }
);

const businessSlice = createSlice({
  name: 'business',
  initialState,
  reducers: {
    setBusinessPeriod: (state, action: PayloadAction<BusinessPeriod>) => {
      state.period = action.payload;
    },
    setCatalogFilter: (state, action: PayloadAction<'all' | 'low' | 'out'>) => {
      state.catalogFilter = action.payload;
    },
    setOrdersFilter: (state, action: PayloadAction<string>) => {
      state.ordersFilter = action.payload;
    },
    patchLocalOrderStatus: (state, action: PayloadAction<{ orderId: string; status: string }>) => {
      state.orders = state.orders.map((o) =>
        o.id === action.payload.orderId ? { ...o, status: action.payload.status } : o
      );
      if (state.kpis?.recent_orders) {
        state.kpis.recent_orders = state.kpis.recent_orders.map((o) =>
          o.id === action.payload.orderId ? { ...o, status: action.payload.status } : o
        );
      }
    },
    setCampaigns: (state, action: PayloadAction<MarketingCampaign[]>) => {
      state.campaigns = action.payload;
    },
    markNotificationReadLocal: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      state.notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true, read_at: n.read_at || new Date().toISOString() } : n
      );
      state.unreadNotificationCount = state.notifications.filter((n) => !n.read).length;
    },
    clearBusiness: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinessDashboard.pending, (state, action) => {
        if (!action.meta.arg?.silent) state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBusinessDashboard.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.period = action.payload.period;
        state.kpis = action.payload.kpis;
        state.timeseries = action.payload.timeseries;
        state.funnel = action.payload.funnel;
        state.topProducts = action.payload.topProducts;
        state.lastFetchedAt = new Date().toISOString();
      })
      .addCase(fetchBusinessDashboard.rejected, (state, action) => {
        if (action.meta.aborted || action.meta.condition) return;
        state.status = 'failed';
        state.error = typeof action.payload === 'string' ? action.payload : 'Failed to load dashboard';
      })
      .addCase(fetchBusinessProducts.pending, (state) => {
        state.productsStatus = 'loading';
      })
      .addCase(fetchBusinessProducts.fulfilled, (state, action) => {
        state.productsStatus = 'succeeded';
        state.products = action.payload;
      })
      .addCase(fetchBusinessProducts.rejected, (state) => {
        state.productsStatus = 'failed';
      })
      .addCase(fetchBusinessOrders.pending, (state) => {
        state.ordersStatus = 'loading';
      })
      .addCase(fetchBusinessOrders.fulfilled, (state, action) => {
        state.ordersStatus = 'succeeded';
        state.orders = action.payload;
      })
      .addCase(fetchBusinessOrders.rejected, (state) => {
        state.ordersStatus = 'failed';
      })
      .addCase(fetchBusinessGrow.pending, (state) => {
        state.growStatus = 'loading';
      })
      .addCase(fetchBusinessGrow.fulfilled, (state, action) => {
        state.growStatus = 'succeeded';
        state.partnerships = action.payload.partnerships;
        state.partnershipRequests = action.payload.requests;
        state.discoverInstructors = action.payload.discover;
        state.partnershipPerformance = action.payload.performance;
        state.campaigns = action.payload.campaigns;
      })
      .addCase(fetchBusinessGrow.rejected, (state) => {
        state.growStatus = 'failed';
      })
      .addCase(fetchBusinessSettings.fulfilled, (state, action) => {
        state.settings = action.payload;
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.customers = action.payload;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.notifications = action.payload;
        state.unreadNotificationCount = action.payload.filter((n) => !n.read).length;
      })
      .addCase(fetchPromoCodes.fulfilled, (state, action) => {
        state.promoCodes = action.payload;
      });
  },
});

export const {
  setBusinessPeriod,
  setCatalogFilter,
  setOrdersFilter,
  patchLocalOrderStatus,
  setCampaigns,
  markNotificationReadLocal,
  clearBusiness,
} = businessSlice.actions;

export default businessSlice.reducer;
