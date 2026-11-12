import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref, type Route } from './router';

describe('router', () => {
  const routes: Route[] = [
    { name: 'start' },
    { name: 'results' },
    { name: 'program', id: 'food-help' },
    { name: 'question', id: 'income', then: null },
    { name: 'question', id: 'residentStatus', then: { name: 'program', id: 'food-help' } },
    { name: 'question', id: 'housing', then: { name: 'results' } },
    { name: 'doc' },
    { name: 'doc-preview' },
    { name: 'doc-review' },
  ];
  for (const route of routes) it(`round-trips ${routeHref(route)}`, () => expect(parseRoute(routeHref(route))).toEqual(route));
  it('falls back to start for unknown or malformed hashes', () => {
    for (const hash of ['', '#', '#/nope', '#/q/', '#/q/<script>', '#/program/a b']) expect(parseRoute(hash)).toEqual({ name: 'start' });
    expect(parseRoute('#/q/income?then=javascript:alert(1)')).toEqual({ name: 'question', id: 'income', then: null });
  });
});
