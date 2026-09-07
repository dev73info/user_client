import {
  apiUrl,
  authHeader,
  authHeaders,
  createHttpClient,
  HttpError,
  normalizeBackendPath,
  readErrorMessage,
} from '@/shared/api/httpClient'

export { apiUrl, authHeader, authHeaders, HttpError, normalizeBackendPath, readErrorMessage }

export const { requestJson, requestText, requestVoid } = createHttpClient()
