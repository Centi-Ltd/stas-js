const bsv = require('@vaionex/bsv')
const util = require('../../lib/stas')
const utils = require('../utils/test_utils')
const expect = require('chai').expect
require('dotenv').config()

const {
  contract,
  issue,
  merge,
  split,
  transfer
} = require('../../index')

const {
  getTransaction,
  getFundsFromFaucet,
  broadcast
} = require('../../index').utils

it('Merge Invalid Token Invalidates both token utxos', async () => {
  const issuerPrivateKey = bsv.PrivateKey()
  const fundingPrivateKey = bsv.PrivateKey()

  const alicePrivateKey = bsv.PrivateKey()
  const aliceAddr = alicePrivateKey.toAddress(process.env.NETWORK).toString()

  const bobPrivateKey = bsv.PrivateKey()
  const bobAddr = bobPrivateKey.toAddress(process.env.NETWORK).toString()

  const contractUtxos = await getFundsFromFaucet(issuerPrivateKey.toAddress(process.env.NETWORK).toString())
  const fundingUtxos = await getFundsFromFaucet(fundingPrivateKey.toAddress(process.env.NETWORK).toString())
  const fundingUtxos2 = await getFundsFromFaucet(fundingPrivateKey.toAddress(process.env.NETWORK).toString())

  const attackerPrivateKey = bsv.PrivateKey()
  let attackerFundsUtxo = await getFundsFromFaucet(attackerPrivateKey.toAddress(process.env.NETWORK).toString())
  const attackerAddress = attackerPrivateKey.toAddress(process.env.NETWORK).toString()
  console.log(`Attacker Address: ${attackerAddress}`)

  const publicKeyHash = bsv.crypto.Hash.sha256ripemd160(issuerPrivateKey.publicKey.toBuffer()).toString('hex')
  const attackerPublicKeyHash = bsv.crypto.Hash.sha256ripemd160(attackerPrivateKey.publicKey.toBuffer()).toString('hex')
  const supply = 10000
  const symbol = 'TAALT'
  const schema = utils.schema(publicKeyHash, symbol, supply)

  const contractHex = contract(
    issuerPrivateKey,
    contractUtxos,
    fundingUtxos,
    fundingPrivateKey,
    schema,
    supply
  )
  const contractTxid = await broadcast(contractHex)
  console.log(`Contract TX:     ${contractTxid}`)
  const contractTx = await getTransaction(contractTxid)

  const issueInfo = [
    {
      addr: aliceAddr,
      satoshis: 7000,
      data: 'one'
    },
    {
      addr: bobAddr,
      satoshis: 3000,
      data: 'two'
    }
  ]
  let issueHex
  try {
    issueHex = issue(
      issuerPrivateKey,
      issueInfo,
      {
        txid: contractTxid,
        vout: 0,
        scriptPubKey: contractTx.vout[0].scriptPubKey.hex,
        amount: contractTx.vout[0].value
      },
      {
        txid: contractTxid,
        vout: 1,
        scriptPubKey: contractTx.vout[1].scriptPubKey.hex,
        amount: contractTx.vout[1].value
      },
      fundingPrivateKey,
      true,
      symbol,
      2
    )
  } catch (e) {
    console.log('error issuing token', e)
    return
  }
  const issueTxid = await broadcast(issueHex)
  console.log(`Issue TX:        ${issueTxid}`)
  const issueTx = await getTransaction(issueTxid)

  const transferhex = transfer(
    alicePrivateKey,
    {
      txid: issueTxid,
      vout: 0,
      scriptPubKey: issueTx.vout[0].scriptPubKey.hex,
      amount: issueTx.vout[0].value
    },
    attackerAddress,
    fundingUtxos2,
    fundingPrivateKey
  )

  const transferTxid = await broadcast(transferhex)
  console.log(`Transfer TX:     ${transferTxid}`)
  const transfertx = await getTransaction(transferTxid)
  const validSplit = new bsv.Transaction(transferhex)

  // we create stas tx and assign to attacker address
  hexSymbol = Buffer.from(symbol).toString('hex')
  attackerFundsUtxo = attackerFundsUtxo[0]
  console.log(attackerFundsUtxo)
  const tx = new bsv.Transaction()
  tx.from(attackerFundsUtxo)
  const stasScript = util.getStasScript(attackerPublicKeyHash, issuerPrivateKey.publicKey, null, true, hexSymbol)
  tx.addOutput(new bsv.Transaction.Output({
    script: transfertx.vout[0].scriptPubKey.hex,
    satoshis: attackerFundsUtxo.amount
  }))
  tx.sign(attackerPrivateKey)

  const txId = await broadcast(tx.serialize(true))
  const attackerObj = new bsv.Transaction(tx.serialize(true))

  const mergeHex = merge(
    attackerPrivateKey,
    [{
      tx: validSplit,
      vout: 0
    },
    {
      tx: attackerObj,
      vout: 0
    }],
    attackerAddress,
    {
      txid: issueTxid,
      vout: 2,
      scriptPubKey: issueTx.vout[2].scriptPubKey.hex,
      amount: issueTx.vout[2].value
    },
    fundingPrivateKey
  )
  const mergeTxId = await broadcast(mergeHex)
  console.log(`Merge TX: ${mergeTxId}`)
  console.log('Bob Balance ' + (await utils.getTokenBalance(attackerAddress)))
  expect(await utils.getTokenBalance(attackerAddress)).to.equal(0)
})
