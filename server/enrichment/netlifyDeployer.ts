import https from 'https';

export interface NetlifyDeployResult {
  success: boolean;
  url?: string;
  error?: string;
  siteId?: string;
  deployId?: string;
}

/**
 * Deploy a single HTML file to Netlify via their API (Netlify Drop style).
 *
 * Creates a new site on every deploy if no siteId is provided, or updates an
 * existing site when siteId is given.
 *
 * Required env vars:
 *   NETLIFY_AUTH_TOKEN — Personal Access Token from netlify.com/user#applications
 *   NETLIFY_SITE_ID    — (optional) existing site ID to redeploy
 */
export async function deployToNetlify(
  html: string,
  siteName?: string,
): Promise<NetlifyDeployResult> {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!token) {
    return { success: false, error: 'NETLIFY_AUTH_TOKEN não configurado no .env' };
  }

  const existingSiteId = process.env.NETLIFY_SITE_ID;

  try {
    // Step 1: Create or get site
    let siteId = existingSiteId;
    if (!siteId) {
      siteId = await createNetlifySite(token, siteName);
      if (!siteId) {
        return { success: false, error: 'Falha ao criar site no Netlify' };
      }
    }

    // Step 2: Deploy the HTML file
    const deploy = await deployFileToSite(token, siteId, html);
    return deploy;
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro desconhecido no deploy Netlify' };
  }
}

async function createNetlifySite(token: string, name?: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      name: name || `leadradar-lp-${Date.now().toString(36)}`,
      force_ssl: true,
    });

    const req = https.request(
      {
        hostname: 'api.netlify.com',
        path: '/api/v1/sites',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed.id);
            } else {
              console.error('Erro Netlify create site:', parsed.message || data);
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function deployFileToSite(
  token: string,
  siteId: string,
  html: string,
): Promise<NetlifyDeployResult> {
  return new Promise((resolve, reject) => {
    const boundary = `boundary_${Date.now()}`;
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="files[/index.html]"',
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
      `--${boundary}--`,
    ].join('\r\n');

    const req = https.request(
      {
        hostname: 'api.netlify.com',
        path: `/api/v1/sites/${siteId}/deploys`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                success: true,
                url: parsed.ssl_url || parsed.url,
                siteId: parsed.site_id,
                deployId: parsed.id,
              });
            } else {
              resolve({
                success: false,
                error: parsed.message || `HTTP ${res.statusCode}`,
              });
            }
          } catch {
            resolve({ success: false, error: 'Resposta inválida do Netlify' });
          }
        });
      },
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}