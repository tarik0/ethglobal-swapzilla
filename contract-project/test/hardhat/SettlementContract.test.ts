import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumberish, Contract, ContractFactory } from "ethers";
import { deployments, ethers } from 'hardhat'

describe('SettlementContract Test', function () {
    // mocked endpoint ids
    const eidA = 1
    const eidB = 2

    // contract factories
    let SettlementContract: ContractFactory
    let EndpointV2Mock: ContractFactory

    // signers
    let ownerA: SignerWithAddress
    let ownerB: SignerWithAddress
    let endpointOwner: SignerWithAddress

    // contracts
    let settlementContractA: Contract
    let settlementContractB: Contract
    let mockEndpointV2A: Contract
    let mockEndpointV2B: Contract

    // before hook to set the contract factories and signers
    before(async function () {
        // get signers
        ;[ownerA, ownerB, endpointOwner] = await ethers.getSigners()

        // get factories
        SettlementContract = await ethers.getContractFactory('SettlementContract')
        const EndpointV2MockArtifact = await deployments.getArtifact('EndpointV2Mock')
        EndpointV2Mock = new ContractFactory(EndpointV2MockArtifact.abi, EndpointV2MockArtifact.bytecode, endpointOwner)
    })

    // beforeEach hook to deploy the contracts
    beforeEach(async function () {
        // deploy mock endpoints
        mockEndpointV2A = await EndpointV2Mock.deploy(eidA)
        mockEndpointV2B = await EndpointV2Mock.deploy(eidB)

        // deploy settlement contracts
        // use eid ids for chain ids
        settlementContractA = await SettlementContract.deploy(mockEndpointV2A.address, ownerA.address, eidA)
        settlementContractB = await SettlementContract.deploy(mockEndpointV2B.address, ownerB.address, eidB)

        // set destination endpoints
        await mockEndpointV2A.setDestLzEndpoint(settlementContractB.address, mockEndpointV2B.address)
        await mockEndpointV2B.setDestLzEndpoint(settlementContractA.address, mockEndpointV2A.address)

        // set peers
        await settlementContractA.connect(ownerA).setPeer(eidB, ethers.utils.zeroPad(settlementContractB.address, 32))
        await settlementContractB.connect(ownerB).setPeer(eidA, ethers.utils.zeroPad(settlementContractA.address, 32))

        // connect the settlement contracts
        await settlementContractA.connect(ownerA).whitelistSettlementContract(
            settlementContractB.address,
            eidB, // use eid as chain id
            eidB
        )
        await settlementContractB.connect(ownerB).whitelistSettlementContract(
            settlementContractA.address,
            eidA, // use eid as chain id
            eidA
        )
    })

    ///
    /// Order Registration
    ///

    function createOrder(
        destSettlementContract: string,
        swapper: string,
        nonce: number,
        originChainId: number,
        inputAmount: BigNumberish
    ) {
        return {
            settlementContract: destSettlementContract,
            swapper: swapper,
            nonce: nonce,
            originChainId: originChainId,
            initiateDeadline: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
            fillDeadline: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
            orderData: ethers.utils.defaultAbiCoder.encode(['uint256'], [inputAmount]),
        }
    }

    async function signOrder(
        order: any,
        settlementContract: Contract, // to compute the hash
        signer: SignerWithAddress
    ) {
        const orderHash = await settlementContract.computeOrderHash(order)
        const signature = await signer.signMessage(ethers.utils.arrayify(orderHash))
        return signature
    }

    it('should be able to initialize order', async () => {
        const [, , , signer] = await ethers.getSigners()
        const settlement = settlementContractA.connect(signer)

        // create order
        const inputAmount = ethers.utils.parseEther('0.1')
        const order = createOrder(
            settlementContractB.address,
            signer.address,
            0,
            eidA,
            inputAmount
        )
        const signature = await signOrder(order, settlement, signer)

        // verify signature
        const isOk = await settlement.verifySignature(order, signature)
        expect(isOk).to.be.true

        // quote initialization
        const quote = await settlement.quoteInitialize(order, eidB)

        // initialize the order
        await settlement.initiate(
            order,
            signature,
            ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256"], [eidB, quote.nativeFee]
            ),
            {
                value: inputAmount.add(quote.nativeFee),
            }
        )
    })

    it('should be able to match two orders and resolve them', async () => {
        const [, , , signerA, signerB] = await ethers.getSigners()
        const settlementA = settlementContractA.connect(signerA)
        const settlementB = settlementContractB.connect(signerB)

        // create order A
        const inputAmountA = ethers.utils.parseEther('0.1')
        const orderA = createOrder(
            settlementContractB.address,
            signerA.address,
            0,
            eidA,
            inputAmountA
        )

        // create order B
        const inputAmountB = ethers.utils.parseEther('0.1')
        const orderB = createOrder(
            settlementContractA.address,
            signerB.address,
            0,
            eidB,
            inputAmountB
        )

        // sign orders
        const signatureA = await signOrder(orderA, settlementA, signerA)
        const signatureB = await signOrder(orderB, settlementB, signerB)

        // quote initialization
        const quoteA = await settlementA.quoteInitialize(orderA, eidB)
        const quoteB = await settlementB.quoteInitialize(orderB, eidA)

        // initialize the orders
        await settlementA.initiate(
            orderA,
            signatureA,
            ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256"], [eidB, quoteA.nativeFee]
            ),
            {
                value: inputAmountA.add(quoteA.nativeFee),
            }
        )
        await settlementB.initiate(
            orderB,
            signatureB,
            ethers.utils.defaultAbiCoder.encode(
                ["uint256", "uint256"], [eidA, quoteB.nativeFee]
            ),
            {
                value: inputAmountB.add(quoteB.nativeFee),
            }
        )

        // get order hash
        const orderHashA = await settlementA.computeOrderHash(orderA)
        const orderHashB = await settlementB.computeOrderHash(orderB)

        // quote match
        const quoteMatchA = await settlementA.quoteMatch(orderHashA, orderHashB)

        // match the orders
        await settlementA.matchOrders(orderHashA, orderHashB, quoteMatchA.nativeFee, {
            value: quoteMatchA.nativeFee,
        })

        // quote resolve
        const quoteResolveA = await settlementA.quoteResolve(orderHashA, orderHashB)

        // resolve the orders
        await settlementA.resolve(
            orderA,
            ethers.utils.defaultAbiCoder.encode(
                ["uint256"], [quoteResolveA.nativeFee]
            ),
            {
            value: quoteResolveA.nativeFee,
            }
        )
    })
})
