import { ethers } from 'hardhat'

const SETTLEMENT_ADDRESS = "0x3544a69a05569388C4Ba9CA5208A5CcB2B945Ac6"
const CROSS_SETTLEMENT_ADDRESS = "0x3544a69a05569388C4Ba9CA5208A5CcB2B945Ac6"
const CROSS_EID = 40161
const CROSS_CHAIN_ID = 11155111

async function deploy() {
    const [deployer] = await ethers.getSigners()
    console.log(`Initializing with the account: ${deployer.address}`)
    console.log(`Account balance: ${await deployer.getBalance()}`)

    const settlement = await ethers.getContractAt('SettlementContract', SETTLEMENT_ADDRESS)

    // whitelist the cross chain settlement contract
    await settlement.connect(deployer).whitelistSettlementContract(
        CROSS_SETTLEMENT_ADDRESS,
        CROSS_CHAIN_ID,
        CROSS_EID
    ).then(tx => tx.wait(1))
    console.log(`Whitelisted cross chain settlement contract: ${CROSS_SETTLEMENT_ADDRESS}`)

    // set peer
    await settlement.connect(deployer).setPeer(
        CROSS_EID, ethers.utils.zeroPad(CROSS_SETTLEMENT_ADDRESS, 32)
    ).then(tx => tx.wait(1))
    console.log(`Set peer for cross chain settlement contract: ${CROSS_SETTLEMENT_ADDRESS}`)
}

deploy()
    .then(() => process.exit(0))
    .catch(console.error)
