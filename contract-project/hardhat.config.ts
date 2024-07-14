// Get the environment configuration from .env file
//
// To make use of automatic environment setup:
// - Duplicate .env file and name it .env
// - Fill in the environment variables
import 'dotenv/config'

import '@nomicfoundation/hardhat-verify'
import 'hardhat-tracer'
import 'hardhat-deploy'
import 'hardhat-contract-sizer'
import '@nomiclabs/hardhat-ethers'
import '@layerzerolabs/toolbox-hardhat'
import { HardhatUserConfig } from 'hardhat/types'

import { EndpointId } from '@layerzerolabs/lz-definitions'

// If you prefer to be authenticated using a private key, set a PRIVATE_KEY environment variable
const PRIVATE_KEY = process.env.PRIVATE_KEY

const config: HardhatUserConfig = {
    paths: {
        cache: 'cache/hardhat',
    },
    solidity: {
        compilers: [
            {
                version: '0.8.22',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    networks: {
        sepolia: {
            eid: EndpointId.SEPOLIA_V2_TESTNET,
            url: 'https://ethereum-sepolia-rpc.publicnode.com',
            accounts: [PRIVATE_KEY as string],
        },
        baseSepolia: {
            url: 'https://base-sepolia-rpc.publicnode.com',
            accounts: [PRIVATE_KEY as string],
        },
        scrollSepolia: {
            url: 'https://scroll-sepolia.drpc.org',
            accounts: [PRIVATE_KEY as string],
        }
    },
    etherscan: {
        apiKey: {
            // Is not required by blockscout. Can be any non-empty string
            sepolia: 'abc',
            baseSepolia: 'abc',
            scrollSepolia: 'abc',
        },
        customChains: [
            {
                network: 'sepolia',
                chainId: 11155111,
                urls: {
                    apiURL: 'https://eth-sepolia.blockscout.com/api',
                    browserURL: 'https://eth-sepolia.blockscout.com/',
                },
            },
            {
                network: 'baseSepolia',
                chainId: 84532,
                urls: {
                    apiURL: 'https://base-sepolia.blockscout.com/api',
                    browserURL: 'https://eth-sepolia.blockscout.com/',
                },
            },
        ],
    },
    sourcify: {
        enabled: false,
    },
}

export default config
