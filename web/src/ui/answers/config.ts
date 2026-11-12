import { useSyncExternalStore } from 'react';
import { appConfig, subscribeConfig, type AppConfig } from '../../data/remote-config';

/** Remote Config values in effect (bundled defaults until the first fetch). */
export function useConfig(): AppConfig {
  return useSyncExternalStore(subscribeConfig, appConfig, appConfig);
}
