// src/store/actions/view.ts
import { AnyAction } from 'redux';
import { ThunkAction } from 'redux-thunk';
import {
  VIEW_HYDRATE, VIEW_SET_MODE, VIEW_SET_VIS, VIEW_SET_GEOMETRY,
  VIEW_STORAGE_KEY, ViewMode, ViewState, FloatGeometry
} from '../reducers/view';

type Thunk<R = void> = ThunkAction<Promise<R> | R, any, unknown, AnyAction>;

const readStorage = (): Promise<ViewState | null> =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.get([VIEW_STORAGE_KEY], (res) => {
        resolve((res && res[VIEW_STORAGE_KEY]) || null);
      });
    } catch {
      resolve(null);
    }
  });

const writeStorage = (data: ViewState): Promise<void> =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [VIEW_STORAGE_KEY]: data }, () => resolve());
    } catch {
      resolve();
    }
  });

export const hydrateView = (): Thunk => async (dispatch, getState) => {
  const data = await readStorage();
  if (data) {
    dispatch({ type: VIEW_HYDRATE, payload: data });
  } else {
    // записываем текущий пустой стейт для единообразия
    await writeStorage(getState().view ?? { preferredModeByTab: {}, visibleByTab: {}, floatGeometryByTab: {} });
  }
};

export const setPreferredMode = (tabId: number, mode: ViewMode): Thunk =>
  async (dispatch, getState) => {
    dispatch({ type: VIEW_SET_MODE, payload: { tabId, mode } });
    await writeStorage(getState().view);
  };

export const setVisible = (tabId: number, visible: boolean): Thunk =>
  async (dispatch, getState) => {
    dispatch({ type: VIEW_SET_VIS, payload: { tabId, visible } });
    await writeStorage(getState().view);
  };

export const setFloatGeometry = (tabId: number, geometry: FloatGeometry): Thunk =>
  async (dispatch, getState) => {
    dispatch({ type: VIEW_SET_GEOMETRY, payload: { tabId, geometry } });
    await writeStorage(getState().view);
  };
