#!/usr/bin/env node

const DEFAULT_PUBLISHED_URL = 'https://workflows.elastic.co/connectors/v1/catalog.json';

export const resolvePublishedCatalogUrl = (env = process.env) => {
  if (!Object.hasOwn(env, 'CONNECTOR_CATALOG_PUBLISHED_URL')) {
    return DEFAULT_PUBLISHED_URL;
  }
  if (env.CONNECTOR_CATALOG_PUBLISHED_URL === '') {
    return null;
  }
  return env.CONNECTOR_CATALOG_PUBLISHED_URL;
};

export const fetchPublishedCatalog = async (url) => {
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch published connector catalog ${url}: HTTP ${response.status}`);
  }
  return response.json();
};
