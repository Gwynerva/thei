import type { H3Event } from 'h3';
import { API_TOKEN_SCOPES } from '#layers/thei/shared/api-token';
import { ownerText } from '../owner-text';
import { getProfile } from '../profile';
import { mcpResource, oauthIssuer } from './base';

/**
 * What an app reads to learn how to connect: the MCP endpoint says which
 * server it signs in at (RFC 9728), and that server says how (RFC 8414).
 * Both are the site itself. It does not pass for OpenID Connect, which asks
 * for much more than a connection needs.
 */

export function protectedResourceMetadata(event: H3Event) {
  let name: string | undefined;
  try {
    name = ownerText(getProfile().displayName) || undefined;
  } catch {
    name = undefined;
  }
  return {
    resource: mcpResource(event),
    authorization_servers: [oauthIssuer(event)],
    scopes_supported: [...API_TOKEN_SCOPES],
    bearer_methods_supported: ['header'],
    ...(name ? { resource_name: name } : {}),
  };
}

export function authorizationServerMetadata(event: H3Event) {
  const issuer = oauthIssuer(event);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [...API_TOKEN_SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}
