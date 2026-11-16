// Hash router: works from a static host and offline from the service worker cache.
import { useSyncExternalStore } from 'react';

export type Then = { readonly name: 'results' } | { readonly name: 'program'; readonly id: string };

export type Route =
  | { readonly name: 'start' }
  | { readonly name: 'question'; readonly id: string; readonly then: Then | null }
  | { readonly name: 'results' }
  | { readonly name: 'program'; readonly id: string }
  | { readonly name: 'doc' }
  | { readonly name: 'doc-preview' }
  | { readonly name: 'doc-review' }
  | { readonly name: 'discover' }
  | { readonly name: 'nearby' }
  | { readonly name: 'device-check' }
  | { readonly name: 'judges' };

const SEGMENT = /^[A-Za-z0-9-]+$/;

function parseThen(value: string | null): Then | null {
  if (value === 'results') return { name: 'results' };
  const m = value === null ? null : /^program\/([A-Za-z0-9-]+)$/.exec(value);
  return m?.[1] ? { name: 'program', id: m[1] } : null;
}

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'q' && parts[1] && SEGMENT.test(parts[1])) {
    return { name: 'question', id: parts[1], then: parseThen(new URLSearchParams(query).get('then')) };
  }
  if (parts[0] === 'results' && parts.length === 1) return { name: 'results' };
  if (parts[0] === 'doc' && parts.length === 1) return { name: 'doc' };
  if (parts[0] === 'doc' && parts[1] === 'preview' && parts.length === 2) return { name: 'doc-preview' };
  if (parts[0] === 'doc' && parts[1] === 'review' && parts.length === 2) return { name: 'doc-review' };
  if (parts[0] === 'discover' && parts.length === 1) return { name: 'discover' };
  if (parts[0] === 'nearby' && parts.length === 1) return { name: 'nearby' };
  if (parts[0] === 'device-check' && parts.length === 1) return { name: 'device-check' };
  if (parts[0] === 'judges' && parts.length === 1) return { name: 'judges' };
  if (parts[0] === 'program' && parts[1] && SEGMENT.test(parts[1])) return { name: 'program', id: parts[1] };
  return { name: 'start' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'start': return '#/';
    case 'results': return '#/results';
    case 'program': return `#/program/${route.id}`;
    case 'doc': return '#/doc';
    case 'doc-preview': return '#/doc/preview';
    case 'doc-review': return '#/doc/review';
    case 'discover': return '#/discover';
    case 'nearby': return '#/nearby';
    case 'device-check': return '#/device-check';
    case 'judges': return '#/judges';
    case 'question': {
      const then = route.then === null ? '' : `?then=${route.then.name === 'results' ? 'results' : `program/${route.then.id}`}`;
      return `#/q/${route.id}${then}`;
    }
  }
}

export function navigate(route: Route): void {
  const href = routeHref(route);
  if (window.location.hash === href) return;
  window.location.hash = href;
}

const subscribe = (listener: () => void): (() => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return parseRoute(hash);
}
