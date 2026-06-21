// netlify/functions/ga4-stats.js
//
// Récupère les statistiques GA4 (visiteurs actifs en temps réel + vues jour/semaine/mois)
// via la Google Analytics Data API, en utilisant un compte de service Google Cloud.
//
// Variables d'environnement requises (Netlify > Site configuration > Environment variables) :
//   GA4_SERVICE_ACCOUNT_KEY  → contenu complet du fichier JSON du compte de service
//   GA4_PROPERTY_ID          → identifiant numérique de la propriété GA4 (ex: 541303237)

const { GoogleAuth } = require('google-auth-library');

const GA4_DATA_API = 'https://analyticsdata.googleapis.com/v1beta';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 30 * 1000;

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
    return { statusCode: 200, headers, body: JSON.stringify({ ...cache.data, cached: true }) };
  }

  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    const rawKey = process.env.GA4_SERVICE_ACCOUNT_KEY;

    if (!propertyId || !rawKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Variables d\'environnement GA4 manquantes sur Netlify' })
      };
    }

    const credentials = JSON.parse(rawKey);

    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly']
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const accessToken = accessTokenResponse.token;

    const [realtime, vuesJour, vuesSemaine, vuesMois] = await Promise.all([
      fetchRealtimeActiveUsers(propertyId, accessToken),
      fetchPageViews(propertyId, accessToken, 'today', 'today'),
      fetchPageViews(propertyId, accessToken, '7daysAgo', 'today'),
      fetchPageViews(propertyId, accessToken, '30daysAgo', 'today')
    ]);

    const result = {
      visiteursActifs: realtime,
      vuesJour,
      vuesSemaine,
      vuesMois,
      updatedAt: new Date().toISOString()
    };

    cache = { data: result, timestamp: now };

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('Erreur GA4 :', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Impossible de récupérer les statistiques GA4', detail: String(err.message || err) })
    };
  }
};

async function fetchRealtimeActiveUsers(propertyId, accessToken) {
  const res = await fetch(`${GA4_DATA_API}/properties/${propertyId}:runRealtimeReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      metrics: [{ name: 'activeUsers' }]
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Erreur runRealtimeReport');
  const value = json.rows?.[0]?.metricValues?.[0]?.value;
  return value ? Number(value) : 0;
}

async function fetchPageViews(propertyId, accessToken, startDate, endDate) {
  const res = await fetch(`${GA4_DATA_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: 'screenPageViews' }]
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Erreur runReport');
  const value = json.rows?.[0]?.metricValues?.[0]?.value;
  return value ? Number(value) : 0;
                             }
