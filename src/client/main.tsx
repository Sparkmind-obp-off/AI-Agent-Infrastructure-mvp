import React, { useCallback, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { App, type IdentityClient } from './App'
import './styles.css'

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined
const testIdentityUiEnabled = import.meta.env.VITE_ENABLE_TEST_AUTH === 'true'
type PublicConfig = { configured: boolean; domain: string | null; issuer: string | null; audience: string | null; clientId: string | null; redirectUri: string; callbackUrl: string; logoutUrl: string; productionUrl: string }

function Auth0App({ config }: { config: PublicConfig }) {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()
  const identity: IdentityClient = {
    configured: true,
    isAuthenticated,
    isLoading,
    label: user?.name ?? user?.email ?? 'Authenticated user',
    getToken: async () => {
      const token = await getAccessTokenSilently()
      if (!token) throw new Error('Authentication token unavailable')
      return token
    },
    signIn: () => loginWithRedirect(),
    signOut: () => logout({ logoutParams: { returnTo: window.location.origin } }),
  }
  return <App identity={identity} publicConfig={config}/>
}

function LocalTestApp({ config }: { config: PublicConfig }) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const signIn = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/test', { method: 'POST' })
      if (!response.ok) throw new Error('Local test identity is disabled.')
      const body = await response.json() as { token: string }
      setToken(body.token)
    } finally { setLoading(false) }
  }, [])
  return <App identity={{
    configured: testIdentityUiEnabled,
    isAuthenticated: Boolean(token),
    isLoading: loading,
    label: token ? 'Local test user' : 'Unauthenticated',
    getToken: async () => token ?? '',
    signIn,
    signOut: () => setToken(null),
  }} publicConfig={config}/>
}

function Root() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  useEffect(() => {
    fetch('/api/public-config').then(async (response) => {
      if (!response.ok) throw new Error('Configuration unavailable')
      return response.json() as Promise<PublicConfig>
    }).then(setConfig).catch(() => setConfig({ configured: false, domain: null, issuer: null, audience: null, clientId: null, redirectUri: window.location.origin, callbackUrl: window.location.origin, logoutUrl: window.location.origin, productionUrl: window.location.origin }))
  }, [])
  if (!config) return <p role="status">Loading production configuration…</p>
  const domain = config.domain ?? auth0Domain
  const clientId = config.clientId ?? auth0ClientId
  const audience = config.audience ?? auth0Audience
  if (!domain || !clientId || !audience || !config.issuer) return <LocalTestApp config={config}/>
  return <Auth0Provider
    domain={domain}
    clientId={clientId}
    authorizationParams={{ redirect_uri: window.location.origin, audience }}
    cacheLocation="memory"
    useRefreshTokens
    onRedirectCallback={() => window.history.replaceState({}, document.title, window.location.pathname)}
  ><Auth0App config={config}/></Auth0Provider>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>)
