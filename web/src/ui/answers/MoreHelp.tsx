// "Other help you could look into" (discover.leads, Search grounding) and "Help near you"
// (nearby.help, Maps grounding at the county centroid). Both are behind Remote Config flags. With a
// flag off the page still stands on its own: it says so and lists the rule pack's official
// information, with no button that cannot work.

import { useId, useRef } from 'react';
import { asPublic } from '../../core/types';
import { discoverLeads, nearbyHelp, planDiscover, planNearby, type Leads, type NearbyHelp, type TaskResult } from '../../ai/tasks';
import { useApp } from '../context';
import { ScreenHeading } from '../Heading';
import { ChevronLeft, ChevronRight, Pin, Search } from '../design/icons';
import { Marker } from '../design/parts';
import { InferenceBadge } from '../InferenceBadge';
import { dynamicKey, programName } from '../i18n';
import { PACK } from '../pack';
import { routeHref } from '../router';
import { useConfig } from './config';
import { countiesFor } from './counties';
import { chooseCounty, useCounty } from './county-choice';
import { OfficialInfo, RequestRegion, SearchSuggestions, SourceList, useRequest } from './parts';
import { answerKey } from './session';
import { silhouetteLines, useSilhouette } from './silhouette';

/** The way back: results, and every program of the rule set with its result. */
function BackToResults() {
  const { t, locale, results } = useApp();
  const id = useId();
  return (
    <nav className="back-nav" aria-labelledby={`${id}-title`} data-testid="back-nav">
      <h2 id={`${id}-title`} className="section-heading">
        {t('results.title')}
      </h2>
      <ul className="program-rows">
        {PACK.programs.map((p) => {
          const verdict = results.find((r) => r.programId === p.id)?.verdict;
          return (
            <li key={p.id}>
              <a href={routeHref({ name: 'program', id: p.id })} className="program-link">
                <span className="program-text">
                  <span className="program-name">{programName(locale, p)}</span>
                  {verdict && (
                    <span className="program-note marker-line">
                      <Marker verdict={verdict} />
                      {t(dynamicKey(`verdict.${verdict}`))}
                    </span>
                  )}
                </span>
                <ChevronRight />
              </a>
            </li>
          );
        })}
      </ul>
      <a className="text-link back-link" href={routeHref({ name: 'results' })}>
        <ChevronLeft />
        {t('detail.back')}
      </a>
    </nav>
  );
}

export function DiscoverScreen() {
  const { t, locale } = useApp();
  const config = useConfig();
  const silhouette = useSilhouette();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRequest<TaskResult<Leads>>(silhouette ? answerKey('discover', locale, silhouette.canonical) : null, silhouette?.canonical ?? 'none', heading);
  if (!config.groundingSearch || !silhouette) {
    return (
      <div className="screen discover" data-testid="discover-screen" data-enabled="false">
        <a className="text-link back-link" href={routeHref({ name: 'results' })}>
          <ChevronLeft />
          {t('detail.back')}
        </a>
        <ScreenHeading size={50} maxLines={3}>
          {t('discover.heading')}
        </ScreenHeading>
        <div className="off-placeholder" aria-hidden="true">
          <Search />
        </div>
        <p className="small">{t('discover.off')}</p>
        <OfficialInfo programs={PACK.programs} />
        <BackToResults />
      </div>
    );
  }
  const input = { profile: silhouette.profile, known: asPublic(PACK.programs.map((p) => programName(locale, p))), locale };
  const find = () => request.start(planDiscover(input), (signal) => discoverLeads(input, { signal }));
  return (
    <div className="screen discover" data-testid="discover-screen" data-enabled="true">
      <a className="text-link back-link" href={routeHref({ name: 'results' })}>
        <ChevronLeft />
        {t('detail.back')}
      </a>
      <ScreenHeading headingRef={heading} size={50} maxLines={3}>
        {t('discover.heading')}
      </ScreenHeading>
      <p className="small">{t('discover.lead')}</p>
      {['idle', 'skipped', 'cancelled'].includes(request.state.status) && (
        <button type="button" className="outline-button" onClick={find}>
          {t('discover.find')}
        </button>
      )}
      <RequestRegion
        state={request.state}
        lines={silhouetteLines(t, locale, silhouette.profile)}
        onSend={request.send}
        onSkip={request.skip}
        onCancel={request.cancel}
        onRetry={find}
        testId="discover-request"
        render={(result) => (
          <section className="leads" aria-labelledby={`${id}-leads`} data-testid="leads">
            <h2 id={`${id}-leads`}>{t('discover.title')}</h2>
            <p className="dashed-note">{t('discover.leadsNote')}</p>
            {result.value.leads.length === 0 ? (
              <p>{t('discover.empty')}</p>
            ) : (
              <ul>
                {result.value.leads.map((lead) => (
                  <li key={lead}>{lead}</li>
                ))}
              </ul>
            )}
            <InferenceBadge source={result.inferenceSource} reason={result.reason} />
            <SourceList sources={result.value.grounding.sources} />
            {result.value.grounding.searchEntryPoint && <SearchSuggestions html={result.value.grounding.searchEntryPoint} />}
          </section>
        )}
      />
      <OfficialInfo programs={PACK.programs} />
      <BackToResults />
    </div>
  );
}

export function NearbyScreen() {
  const { t, locale } = useApp();
  const config = useConfig();
  const silhouette = useSilhouette();
  const county = useCounty();
  const selectId = useId();
  const counties = countiesFor(PACK.jurisdiction);
  const chosen = counties.find((c) => c.id === county) ?? null;
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRequest<TaskResult<NearbyHelp>>(chosen ? answerKey('nearby', locale, chosen.id) : null, `county:${chosen?.id ?? ''}`, heading);
  if (!config.groundingMaps || !silhouette) {
    return (
      <div className="screen nearby" data-testid="nearby-screen" data-enabled="false">
        <a className="text-link back-link" href={routeHref({ name: 'results' })}>
          <ChevronLeft />
          {t('detail.back')}
        </a>
        <ScreenHeading size={50} maxLines={3}>
          {t('nearby.title')}
        </ScreenHeading>
        <div className="off-placeholder" aria-hidden="true">
          <Pin />
        </div>
        <p className="small">{t('nearby.off')}</p>
        <OfficialInfo programs={PACK.programs} />
        <BackToResults />
      </div>
    );
  }
  const input = chosen
    ? { profile: silhouette.profile, centroid: asPublic(chosen.centroid), countyName: asPublic(chosen.name), locale }
    : null;
  const find = () => {
    if (input && input.profile.county !== null) request.start(planNearby(input), (signal) => nearbyHelp(input, { signal }));
  };
  return (
    <div className="screen nearby" data-testid="nearby-screen" data-enabled="true">
      <a className="text-link back-link" href={routeHref({ name: 'results' })}>
        <ChevronLeft />
        {t('detail.back')}
      </a>
      <ScreenHeading headingRef={heading} size={50} maxLines={3}>
        {t('nearby.title')}
      </ScreenHeading>
      <p className="small">{t('nearby.lead')}</p>
      {counties.length === 0 ? (
        <p>{t('nearby.noCounties')}</p>
      ) : (
        <div className="field">
          <label htmlFor={selectId}>{t('nearby.county')}</label>
          <select id={selectId} className="input" value={county ?? ''} onChange={(e) => chooseCounty(e.target.value === '' ? null : e.target.value)}>
            <option value="">{t('nearby.countyNone')}</option>
            {counties.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {chosen && ['idle', 'skipped', 'cancelled'].includes(request.state.status) && (
        <button type="button" className="outline-button" onClick={find}>
          {t('nearby.find')}
        </button>
      )}
      {chosen && (
        <RequestRegion
          state={request.state}
          lines={[t('send.line.area', { value: chosen.name }), t('send.line.jurisdiction', { value: PACK.jurisdiction })]}
          onSend={request.send}
          onSkip={request.skip}
          onCancel={request.cancel}
          onRetry={find}
          testId="nearby-request"
          render={(result) => (
            <section className="places" aria-label={t('nearby.title')} data-testid="places">
              {result.value.places.length === 0 && result.value.lines.length === 0 ? (
                <p>{t('nearby.empty')}</p>
              ) : (
                <ul>
                  {result.value.places.map((p) => (
                    <li key={p.uri}>
                      <a href={p.uri} target="_blank" rel="noopener noreferrer">
                        {p.title}
                      </a>
                      {p.text && <p className="small muted">{p.text}</p>}
                    </li>
                  ))}
                  {result.value.places.length === 0 && result.value.lines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              )}
              {/* Google Maps attribution for grounded place results, as plain text next to the list. */}
              <p className="maps-attribution" translate="no" data-testid="maps-attribution">
                {t('nearby.attribution')}
              </p>
              <InferenceBadge source={result.inferenceSource} reason={result.reason} />
            </section>
          )}
        />
      )}
      <OfficialInfo programs={PACK.programs} />
      <BackToResults />
    </div>
  );
}
