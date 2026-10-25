import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True inside the Expo Go client. Expo Go only ships its bundled native modules, so the
 * VisionCamera/Nitro stack is unavailable there and the expo-camera engine is used instead.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
