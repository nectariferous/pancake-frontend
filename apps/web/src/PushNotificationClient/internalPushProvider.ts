import type { JsonRpcRequest } from '@walletconnect/jsonrpc-utils'
import type { NotifyClient, NotifyClientTypes } from '@walletconnect/notify-client'
import type { EventEmitter } from 'events'
// import { getFirebaseToken } from '../../utils/firebase'
import type { W3iPushProvider } from './types'

export default class InternalPushProvider implements W3iPushProvider {
  private pushClient: NotifyClient | undefined

  public emitter: EventEmitter

  public providerName = 'InternalPushProvider'

  private readonly methodsListenedTo = ['notify_signature_delivered']

  public constructor(emitter: EventEmitter, _name = 'internal') {
    this.emitter = emitter
  }

  /*
   * We need to re-register events from the chat client to the emitter
   * to allow the observers in the facade to work seamlessly.
   */
  public initState(pushClient: NotifyClient) {
    this.pushClient = pushClient

    this.pushClient.on('notify_subscription', (args) => this.emitter.emit('notify_subscription', args))
    this.pushClient.on('notify_message', (args) => this.emitter.emit('notify_message', args))
    this.pushClient.on('notify_update', (args) => this.emitter.emit('notify_update', args))
    this.pushClient.on('notify_delete', (args) => this.emitter.emit('notify_delete', args))

    this.pushClient.syncClient.on('sync_update', () => {
      this.emitter.emit('sync_update', {})
    })

    this.pushClient.subscriptions.core.on('sync_store_update', () => {
      this.emitter.emit('sync_update', {})
    })
  }

  // ------------------------ Provider-specific methods ------------------------

  // eslint-disable-next-line class-methods-use-this
  private formatClientRelatedError(method: string) {
    return `An initialized PushClient is required for method: [${method}].`
  }

  public isListeningToMethodFromPostMessage(method: string) {
    return this.methodsListenedTo.includes(method)
  }

  public handleMessage(request: JsonRpcRequest<unknown>) {
    switch (request.method) {
      case 'notify_signature_delivered':
        this.emitter.emit('notify_signature_delivered', request.params)
        break
      default:
        throw new Error(`Method ${request.method} unsupported by provider ${this.providerName}`)
    }
  }

  public initInternalProvider(pushClient: NotifyClient) {
    this.initState(pushClient)
  }

  // Method to be used by external providers. Not internal use.
  public postMessage(messageData: JsonRpcRequest<unknown>) {
    this.emitter.emit(messageData.id.toString(), messageData)
    if (this.isListeningToMethodFromPostMessage(messageData.method)) {
      this.handleMessage(messageData)
    }
  }

  // ------------------- Method-forwarding for NotifyClient -------------------

  public async register(params: { account: string }) {
    if (!this.pushClient) {
      throw new Error(this.formatClientRelatedError('approve'))
    }
    const alreadySynced = this.pushClient.syncClient.signatures.getAll({
      account: params.account,
    }).length

    let identityKey = ''
    try {
      identityKey = await this.pushClient.identityKeys.getIdentity({
        account: params.account,
      })
    } catch (error) {
      console.error({ error })
    }

    if (alreadySynced && identityKey !== '') {
      return Promise.resolve(identityKey)
    }

    return this.pushClient.register({
      ...params,
      onSign: async (message) => {
        this.emitter.emit('notify_signature_requested', { message })

        return new Promise((resolve) => {
          const intervalId = setInterval(() => {
            const signatureForAccountExists = this.pushClient?.syncClient?.signatures?.getAll({
              account: params.account,
            })?.length
            if (this.pushClient && signatureForAccountExists) {
              const { signature: syncSignature } = this.pushClient.syncClient.signatures.get(params.account)
              this.emitter.emit('notify_signature_request_cancelled', {})
              clearInterval(intervalId)
              resolve(syncSignature)
            }
          }, 100)

          this.emitter.on(
            'notify_signature_delivered',
            ({ signature: deliveredSyncSignature }: { signature: string }) => {
              resolve(deliveredSyncSignature)
            },
          )
        })
      },
    })
  }

  public async subscribe(params: { metadata: NotifyClientTypes.Metadata; account: string }) {
    if (!this.pushClient) {
      throw new Error(this.formatClientRelatedError('subscribe'))
    }
    const subscribed = await this.pushClient.subscribe({
      ...params,
    })

    return subscribed
  }

  public async update(params: { topic: string; scope: string[] }) {
    if (!this.pushClient) {
      throw new Error(this.formatClientRelatedError('update'))
    }

    const updated = await this.pushClient.update(params)

    return updated
  }

  public async deleteSubscription(params: { topic: string }) {
    if (!this.pushClient) {
      throw new Error(this.formatClientRelatedError('deleteSubscription'))
    }

    return this.pushClient.deleteSubscription(params).then(() => {
      this.emitter.emit('notify_delete', {})
    })
  }

  public async getActiveSubscriptions(params?: { account: string }) {
    if (!this.pushClient || !params?.account) {
      throw new Error(this.formatClientRelatedError('getActiveSubscriptions'))
    }
    return Promise.resolve(this.pushClient.getActiveSubscriptions())
  }

  public async getMessageHistory(params: { topic: string }) {
    if (!this.pushClient) {
      throw new Error(this.formatClientRelatedError('getMessageHistory'))
    }
    const messages = this.pushClient.getMessageHistory(params)
    return Promise.resolve(messages)
  }

  public async deleteNotifyMessage(params: { id: number }) {
    if (!this.pushClient) {
      throw new Error(this.formatClientRelatedError('deleteNotifyMessage'))
    }

    this.pushClient.deleteNotifyMessage(params)

    return Promise.resolve()
  }
}
