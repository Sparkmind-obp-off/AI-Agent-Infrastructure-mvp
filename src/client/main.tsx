import React, { useCallback, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { App, type IdentityClient } from './App'
import './styles.css'

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined
const testIdentityUiEnabled = import.meta.env.VITE_ENABLE_TEST_AUTH === 'true'

function Auth0App() {
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
  return <App identity={identity}/>
}

function LocalTestApp() {
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
  }}/>
}

function Root() {
  if (!auth0Domain || !auth0ClientId || !auth0Audience) return <LocalTestApp/>
  return <Auth0Provider
    domain={auth0Domain}
    clientId={auth0ClientId}
    authorizationParams={{ redirect_uri: window.location.origin, audience: auth0Audience }}
    cacheLocation="memory"
    useRefreshTokens
    onRedirectCallback={() => window.history.replaceState({}, document.title, window.location.pathname)}
  ><Auth0App/></Auth0Provider>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>)
