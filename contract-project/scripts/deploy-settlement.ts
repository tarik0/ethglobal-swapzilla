import { ethers } from 'hardhat'

const ENDPOINT_ADDRESS = '0x6EDCE65403992e310A62460808c4b910D972f10f'

async function deploy() {
    const [deployer] = await ethers.getSigners()
    console.log(`Deploying contracts with the account: ${deployer.address}`)
    console.log(`Account balance: ${await deployer.getBalance()}`)

    const chainId = await deployer.getChainId()
    const factory = await ethers.getContractFactory('SettlementContract')
    const contract = await factory.deploy(ENDPOINT_ADDRESS, deployer.address, chainId)
    await contract.deployed()

    console.log(`SettlementContract address: ${contract.address}`)
    console.log(`Deploy Args | Endpoint: ${ENDPOINT_ADDRESS}, Delegate: ${deployer.address}, ChainId: ${chainId}`)
}

deploy()
    .then(() => process.exit(0))
    .catch(console.error)
