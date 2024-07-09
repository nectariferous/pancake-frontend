/**
 * Enhanced Router and Endpoints
 * @author Original: Nectariferous | https://t.me/likhondotxyz
 * @author Enhancements: [Your Name/Handle]
 */

import { CORS_ALLOW, handleCors, wrapCorsHeader } from '@pancakeswap/worker-utils'
import { Router } from 'itty-router'
import { error, missing } from 'itty-router-extras'

const CORS_METHODS = 'POST, OPTIONS'
const CORS_HEADERS = 'referer, origin, content-type, x-sf'

interface EndpointConfig {
  url: string
  allowLocalhost?: boolean
  customHeaders?: Record<string, string>
}

const router = Router()

function createEndpoint({ url, allowLocalhost = true, customHeaders = {} }: EndpointConfig) {
  return async (request: Request, env: any, headers: Headers): Promise<Response> => {
    const ip = headers.get('X-Forwarded-For') || headers.get('Cf-Connecting-Ip') || ''
    const origin = headers.get('origin')
    const isLocalhost = origin === 'http://localhost:3000'

    if (!allowLocalhost && isLocalhost) {
      return error(403, 'Localhost not allowed for this endpoint')
    }

    let body: string
    try {
      body = await request.text()
      if (!body) {
        throw new Error('Missing body')
      }
    } catch (err) {
      console.error('Error reading request body:', err)
      return error(400, 'Invalid or missing body')
    }

    const fetchHeaders = new Headers({
      'X-Forwarded-For': ip,
      origin: isLocalhost ? 'https://pancakeswap.finance' : origin || '',
      ...customHeaders,
    })

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: fetchHeaders,
        body,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return response
    } catch (err) {
      console.error(`Error fetching from ${url}:`, err)
      return error(500, 'Internal server error')
    }
  }
}

// Define your endpoints
router.post('/bsc-exchange', createEndpoint({ url: NODE_REAL_DATA_ENDPOINT }))
router.post('/opbnb-exchange-v3', createEndpoint({ url: OPBNB_ENDPOINT }))

// CORS handling
router.options('*', handleCors(CORS_ALLOW, CORS_METHODS, CORS_HEADERS))

// 404 handler
router.all('*', () => missing('Not found'))

// Event listener
addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(
    router
      .handle(event.request, event, event.request.headers)
      .then((res) => wrapCorsHeader(event.request, res, { allowedOrigin: CORS_ALLOW }))
      .catch((err) => {
        console.error('Unhandled error:', err)
        return error(500, 'Internal server error')
      })
  )
})

// Type declaration for global variables (assuming they are defined elsewhere)
declare const NODE_REAL_DATA_ENDPOINT: string
declare const OPBNB_ENDPOINT: string
