const expect = require("chai").expect
const utils = require('./utils/test_utils')
const bsv = require('bsv')
require('dotenv').config()

const {
    contract,
    issue,
    transfer,
    split,
    redeem
} = require('../index')

const {
    getTransaction,
    getFundsFromFaucet,
    broadcast
} = require('../index').utils


describe('regression, testnet', function () {

    it("Attemmpt to Transfer Non Splittable Token to Issuer", async function () {

        const issuerPrivateKey = bsv.PrivateKey()
        const issuerAddr = issuerPrivateKey.toAddress(process.env.NETWORK).toString()
        const fundingPrivateKey = bsv.PrivateKey()
        const alicePrivateKey = bsv.PrivateKey()
        const aliceAddr = alicePrivateKey.toAddress(process.env.NETWORK).toString()
        const bobPrivateKey = bsv.PrivateKey()
        const bobAddr = bobPrivateKey.toAddress(process.env.NETWORK).toString()
        const contractUtxos = await getFundsFromFaucet(issuerPrivateKey.toAddress(process.env.NETWORK).toString())
        const fundingUtxos = await getFundsFromFaucet(fundingPrivateKey.toAddress(process.env.NETWORK).toString())
        const publicKeyHash = bsv.crypto.Hash.sha256ripemd160(issuerPrivateKey.publicKey.toBuffer()).toString('hex')
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

        let issueHex
        try {
            issueHex = issue(
                issuerPrivateKey,
                utils.getIssueInfo(aliceAddr, 7000, bobAddr, 3000),
                utils.getUtxo(contractTxid, contractTx, 0),
                utils.getUtxo(contractTxid, contractTx, 1),
                fundingPrivateKey,
                false,
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
        const tokenId = await utils.getToken(issueTxid)
        let response = await utils.getTokenResponse(tokenId)
        expect(response.symbol).to.equal(symbol)

        const issueOutFundingVout = issueTx.vout.length - 1

        const transferHex = transfer(
            bobPrivateKey,
            issuerPrivateKey.publicKey,
            utils.getUtxo(issueTxid, issueTx, 1),
            issuerAddr,
            utils.getUtxo(issueTxid, issueTx, issueOutFundingVout),
            fundingPrivateKey
        )
        try {
            await broadcast(transferHex)
            assert(false)
            return
        } catch (e) {
            expect(e).to.be.instanceOf(Error)
            expect(e.response.data).to.contain('mandatory-script-verify-flag-failed')
        }
    })
})