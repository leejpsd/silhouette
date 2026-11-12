// Links to "Other help" and "Help near you", shown only for features that are switched on.
import { useApp } from '../context';
import { routeHref } from '../router';
import { useConfig } from './config';

export function MoreHelpLinks() {
  const { t } = useApp();
  const config = useConfig();
  if (!config.groundingSearch && !config.groundingMaps) return null;
  return (
    <nav className="more-help" aria-label={t('more.title')} data-testid="more-help">
      <h2>{t('more.title')}</h2>
      <ul>
        {config.groundingSearch && (
          <li>
            <a href={routeHref({ name: 'discover' })}>{t('more.discover')}</a>
          </li>
        )}
        {config.groundingMaps && (
          <li>
            <a href={routeHref({ name: 'nearby' })}>{t('more.nearby')}</a>
          </li>
        )}
      </ul>
    </nav>
  );
}

