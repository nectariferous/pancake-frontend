import { useAccount } from 'wagmi'
import { AutoRenewIcon, HistoryIcon, IconButton } from '@pancakeswap/uikit'
import useLocalDispatch from 'contexts/LocalRedux/useLocalDispatch'
import { setHistoryPaneState } from 'state/predictions'
import { useGetIsFetchingHistory } from 'state/predictions/hooks'
import { useCallback } from 'react'

const HistoryButton = () => {
  const isFetchingHistory = useGetIsFetchingHistory()
  const dispatch = useLocalDispatch()
  const { address: account } = useAccount()

  const handleClick = useCallback(() => {
    dispatch(setHistoryPaneState(true))
  }, [dispatch])

  return (
    <IconButton
      id="prediction-history-button"
      variant="subtle"
      onClick={handleClick}
      isLoading={isFetchingHistory}
      disabled={!account}
    >
      {isFetchingHistory ? <AutoRenewIcon spin color="white" /> : <HistoryIcon width="24px" color="white" />}
    </IconButton>
  )
}

export default HistoryButton
