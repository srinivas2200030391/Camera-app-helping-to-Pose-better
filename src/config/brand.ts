import Constants from 'expo-constants';

/** Display name comes from app.config.ts so the product can be renamed in one place. */
export const APP_NAME: string = Constants.expoConfig?.name ?? 'PoseLens AI';

export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';
