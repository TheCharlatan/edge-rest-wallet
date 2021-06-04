import bodyParser from 'body-parser'
import cors from 'cors'
import {
  addEdgeCorePlugins,
  EdgeAccount,
  EdgeContext,
  EdgeCurrencyWallet,
  EdgeSpendInfo,
  EdgeSpendTarget,
  EdgeTransaction,
  lockEdgeCorePlugins,
  makeEdgeContext
} from 'edge-core-js'
import bitcoin from 'edge-currency-plugins/lib/btc'
import express from 'express'
import CONFIG from '../config.json'
addEdgeCorePlugins({
  ...bitcoin
})
lockEdgeCorePlugins()
async function main(): Promise<void> {
  const app = express()
  // Start the core, with Bitcoin enabled:
  const context: EdgeContext = await makeEdgeContext({
    apiKey: CONFIG.apiKey,
    appId: CONFIG.appId,
    plugins: CONFIG.plugins
  })
  // Log in to some user:
  const account: EdgeAccount = await context.loginWithPassword(
    CONFIG.username,
    CONFIG.password,
    { otpKey: CONFIG.otpKey }
  )
  app.use(bodyParser.json({ limit: '1mb' }))
  app.use(cors())
  app.get('/receive/', async (req, res, next) => {
    const type = req.query.type
    const walletInfo = account.getFirstWalletInfo(`wallet:${type}`)
    if (walletInfo == null) {
      res.status(404).send(`${type} is invalid`)
      return
    }
    try {
      const wallet: EdgeCurrencyWallet = await account.waitForCurrencyWallet(
        walletInfo.id
      )
      const receive = await wallet.getReceiveAddress()
      res.json(receive)
    } catch (e) {
      res.status(500).send(e)
    }
  })
  // Getting wallet balances based on type of wallet
  app.get('/balances/', async (req, res, next) => {
    const type = req.query.type
    try {
      const walletInfo = account.getFirstWalletInfo(`wallet:${type}`)
      if (walletInfo == null) {
        res.status(404).send(`${type} is invalid`)
        return
      }
      const wallet: EdgeCurrencyWallet = await account.waitForCurrencyWallet(
        walletInfo.id
      )
      res.json(wallet.balances)
    } catch (e) {
      res.status(500).send('Server error in waitForCurrencyWallet')
    }
  })
  // Get wallet transactions based on type of wallet
  app.get('/transactions/', async (req, res, next) => {
    const type = req.query.type
    const count = parseInt(JSON.stringify(req.query.count ?? 10))
    const offset = parseInt(JSON.stringify(req.query.offset ?? 0))
    const walletInfo = account.getFirstWalletInfo(`wallet:${type}`)
    if (walletInfo == null) {
      res.status(404).send(`${type} is invalid`)
      return
    }
    try {
      const wallet: EdgeCurrencyWallet = await account.waitForCurrencyWallet(
        walletInfo.id
      )
      try {
        const transactions: EdgeTransaction[] = await wallet.getTransactions({
          startIndex: offset,
          startEntries: count
        })
        const cleanTransactions = transactions.filter(value => {
          return value
        })
        res.send(cleanTransactions)
      } catch (e) {
        console.log(e)
        res.send(e)
      }
    } catch (e) {
      res.status(500).send('Server error in waitForCurrencyWallet')
    }
  })
  app.post('/spend/', async (req, res, next) => {
    const type = req.query.type
    const spendInfo: EdgeSpendInfo = req.body
    const walletInfo = account.getFirstWalletInfo(`wallet:${type}`)
    if (walletInfo == null) {
      res.status(404).send(`${type} is invalid`)
      return
    }
    const wallet: EdgeCurrencyWallet = await account.waitForCurrencyWallet(
      walletInfo.id
    )
    try {
      const edgeTransaction = await wallet.makeSpend(spendInfo)
      try {
        const signedTx = await wallet.signTx(edgeTransaction)
        // await wallet.broadcastTx(signedTx)
        // await wallet.saveTx(signedTx)
        res.send(signedTx)
      } catch (e) {
        console.error(e)
        res.status(500).send('Internal server error')
      }
    } catch (e) {
      console.log(e)
      res.status(400).send('Body does not match EdgeSpendInfo specification')
    }
  })
  app.listen(CONFIG.httpPort, () => {
    console.log('Server is listening on:', CONFIG.httpPort)
  })
}
main().catch(e => {
  console.error(e)
  process.exit(1)
})
