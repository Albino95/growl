import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  fetchBusinessDashboard,
  setBusinessPeriod,
  type FetchBusinessArgs,
} from '../store/slices/businessSlice';
import type { BusinessPeriod } from '../services/api/business';

/** Shared business dashboard fetch with optional period switch + SWR. */
export function useBusinessDashboard() {
  const dispatch = useAppDispatch();
  const period = useAppSelector((s) => s.business.period);
  const kpis = useAppSelector((s) => s.business.kpis);
  const timeseries = useAppSelector((s) => s.business.timeseries);
  const funnel = useAppSelector((s) => s.business.funnel);
  const topProducts = useAppSelector((s) => s.business.topProducts);
  const status = useAppSelector((s) => s.business.status);
  const error = useAppSelector((s) => s.business.error);

  useEffect(() => {
    void dispatch(fetchBusinessDashboard({ period, force: true }));
  }, [dispatch, period]);

  const setPeriod = useCallback(
    (next: BusinessPeriod) => {
      if (next === period) return;
      dispatch(setBusinessPeriod(next));
    },
    [dispatch, period]
  );

  const refresh = useCallback(
    (args?: FetchBusinessArgs) => {
      return dispatch(fetchBusinessDashboard({ period, force: true, ...args }));
    },
    [dispatch, period]
  );

  return {
    period,
    setPeriod,
    kpis,
    timeseries,
    funnel,
    topProducts,
    status,
    error,
    loading: status === 'loading' && !kpis,
    refresh,
  };
}
