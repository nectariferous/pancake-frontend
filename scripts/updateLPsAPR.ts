/**
 * LP APR Fetcher and Updater
 * @author Nectariferous | https://t.me/likhondotxyz
 */

import { ChainId, getChainName } from '@pancakeswap/chains'
import { SerializedFarmConfig } from '@pancakeswap/farms'
import fs from 'fs/promises'
import path from 'path'
import { fetchV2FarmsAvgInfo, fetchStableFarmsAvgInfo, type AvgInfo } from '../apps/web/src/queries/farms'
import { BigNumber } from 'bignumber.js'

interface AprMap {
  [key: string]: number
}

const FETCH_CHAIN_ID = [ChainId.BSC, ChainId.ETHEREUM]
const MAX_RETRIES = 3
const RETRY_DELAY = 2000 // 2 seconds

const getAprs = (aprRes: { [key: string]: Pick<AvgInfo, 'apr7d'> }): AprMap => {
  return Object.entries(aprRes).reduce((map, [addr, apr]) => {
    if (apr?.apr7d) {
      const aprValue = new BigNumber(apr.apr7d).times(100).decimalPlaces(5).toNumber()
      if (isFinite(aprValue) && !isNaN(aprValue)) {
        map[addr] = aprValue
      }
    }
    return map
  }, {} as AprMap)
}

const fetchWithRetry = async <T>(fetchFn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> => {
  try {
    return await fetchFn()
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return fetchWithRetry(fetchFn, retries - 1)
    }
    throw error
  }
}

const fetchAndUpdateLPsAPR = async () => {
  await Promise.all(
    FETCH_CHAIN_ID.map(async (chainId) => {
      try {
        const [v2Aprs, stableAprs] = await Promise.all([
          fetchWithRetry(() => fetchV2FarmsAvgInfo(chainId)),
          fetchWithRetry(() => fetchStableFarmsAvgInfo(chainId)),
        ])

        const aprs = {
          ...getAprs(v2Aprs),
          ...getAprs(stableAprs),
        }

        const filePath = path.join(process.cwd(), `apps/web/src/config/constants/lpAprs/${chainId}.json`)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, JSON.stringify(aprs, null, 2) + '\n')

        console.info(`✅ - lpAprs.json has been updated for chain ${chainId}!`)
      } catch (error) {
        console.error(`❌ - Error updating lpAprs.json for chain ${chainId}:`, error)
      }
    })
  )
}

const farmConfigCache: Record<number, SerializedFarmConfig[]> = {}

export const getFarmConfig = async (chainId: ChainId): Promise<SerializedFarmConfig[]> => {
  if (farmConfigCache[chainId]) {
    return farmConfigCache[chainId]
  }

  const chainName = getChainName(chainId)
  try {
    const { default: farmConfig } = await import(`../packages/farms/constants/${chainName}`)
    const filteredConfig = farmConfig.filter((f: SerializedFarmConfig) => f.pid !== null)
    farmConfigCache[chainId] = filteredConfig
    return filteredConfig
  } catch (error) {
    console.error(`Cannot get farm config for chain ${chainId} (${chainName}):`, error)
    return []
  }
}

const main = async () => {
  console.time('Fetch and update LPs APR')
  await fetchAndUpdateLPsAPR()
  console.timeEnd('Fetch and update LPs APR')
}

main().catch(error => {
  console.error('An unexpected error occurred:', error)
  process.exit(1)
})
