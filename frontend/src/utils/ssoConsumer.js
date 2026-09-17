// frontend/src/utils/ssoConsumer.js
import { getApiBaseUrl } from './apiBaseUrl';

/**
 * SSO Token Consumer Utility
 * Handles SSO token consumption when SSO portal redirects to frontend
 */
export async function consumeSsoTokenIfPresent() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('sso_token');
    const returnUrl = params.get('return_url') || '/dashboard';
    
    if (!token) {
      console.log('[SSO-Consumer] No SSO token found in URL');
      return;
    }

    console.log('[SSO-Consumer] SSO token found, processing...');

    const apiBase = getApiBaseUrl();
    
    // Call backend API to validate the token and create session
    const response = await fetch(`${apiBase}/auth/validate-sso`, {
      method: 'POST',
      credentials: 'include', // Important: include cookies for session
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        sso_token: token
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[SSO-Consumer] SSO authentication successful:', result.message);
      
      // Clear URL parameters to avoid reprocessing
      const url = new URL(window.location);
      url.searchParams.delete('sso_token');
      url.searchParams.delete('return_url');
      window.history.replaceState({}, document.title, url.pathname + url.search);
      
      // Redirect to intended destination
      window.location.href = returnUrl || '/dashboard';
    } else {
      const errorData = await response.json();
      console.error('[SSO-Consumer] SSO validation failed:', errorData);
      
      // Fallback: redirect to SSO login
      redirectToSSOLogin();
    }
  } catch (err) {
    console.error('[SSO-Consumer] SSO validation error:', err);
    // Fallback: redirect to SSO login
    redirectToSSOLogin();
  }
}

/**
 * Redirect to SSO login portal
 */
function redirectToSSOLogin() {
  // Use environment variable for SSO base URL
  const ssoBaseUrl = import.meta.env.VITE_SSO_BASE_URL || 
    (import.meta.env.DEV ? 'http://localhost:3003' : 'https://sso.bylinelms.com');
  const ssoLoginUrl = `${ssoBaseUrl}/login`;
  
  console.log('[SSO-Consumer] Redirecting to SSO login:', ssoLoginUrl);
  window.location.href = ssoLoginUrl;
}







