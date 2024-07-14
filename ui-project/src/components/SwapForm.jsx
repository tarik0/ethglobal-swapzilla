import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./ui/label";
import settlementAbi from "./settlement.json";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import {
  useWeb3ModalAccount, useWeb3ModalProvider,
  useWeb3ModalState,
} from "@web3modal/ethers5/react";
import {ethers} from "ethers";

const BottomGradient = () => {
  return (
    <>
      <span className="group-hover/btn:opacity-100 block transition duration-500 opacity-0 absolute h-px w-full -bottom-px inset-x-0 bg-gradient-to-r from-transparent via-secondary to-transparent" />
      <span className="group-hover/btn:opacity-100 blur-sm block transition duration-500 opacity-0 absolute h-px w-1/2 mx-auto -bottom-px inset-x-20 bg-gradient-to-r from-transparent via-secondary to-transparent" />
    </>
  );
};

const LabelInputContainer = ({ children, className }) => {
  return (
    <div className={cn("flex flex-col space-y-2 w-full", className)}>
      {children}
    </div>
  );
};

const SwapForm = ({ isWalletConnected, walletAddress }) => {
  //---FORM DATA---
  const [originChain, setOriginChain] = useState("");
  const [targetChain, setTargetChain] = useState("");
  const [deadline, setDeadline] = useState("");
  const [amount, setAmount] = useState("0");
  const { selectedNetworkId } = useWeb3ModalState();
  //---FORM DATA---

  const { address, isConnecting, isDisconnected, isConnected, chainId } =
    useWeb3ModalAccount();

  const { walletProvider } = useWeb3ModalProvider();

  const settlementContractAddress = () => {
    if (originChain.toString() === "11155111") return "0x3544a69a05569388C4Ba9CA5208A5CcB2B945Ac6";
    if (originChain.toString() === "84532") return "0x64f756EE9f17d040610006Ff5a3BB52b58E6066E";
    if (originChain.toString() === "534351") return "0x64f756EE9f17d040610006Ff5a3BB52b58E6066E";
    return "0x0";
  }

  function getEid(chainId) {
    if (chainId === "11155111") return "40161";
    if (chainId === "84532") return "40245";
    if (chainId === "534351") return "40170";
    return "0";
  }

  async function createOrder() {
    const provider = new ethers.providers.Web3Provider(walletProvider)
    const settlementContract = new ethers.Contract(
        settlementContractAddress(),
        settlementAbi,
        provider
    )
    const nonce = await settlementContract.nonceOf(address)
    return {
      settlementContract: settlementContractAddress(),
      swapper: address,
      nonce: nonce,
      originChainId: chainId,
      initiateDeadline: Math.floor(Date.now() / 1000) + parseInt(deadline.toString()),
      fillDeadline: Math.floor(Date.now() / 1000) + parseInt(deadline.toString()),
      orderData: ethers.utils.defaultAbiCoder.encode(['uint256'], [
          ethers.utils.parseEther(amount.toString())
      ]),
    }
  }

  async function signOrder(order) {
    const provider = new ethers.providers.Web3Provider(walletProvider)
    const signer = provider.getSigner()

    const settlementContract = new ethers.Contract(
        settlementContractAddress(),
        settlementAbi,
        signer
    )
    const orderHash = await settlementContract.computeOrderHash(order)
    const signature = await signer.signMessage(ethers.utils.arrayify(orderHash))
    return signature
  }

  async function quoteInit(order) {
    let destEid = getEid(targetChain)

    const provider = new ethers.providers.Web3Provider(walletProvider)
    const signer = provider.getSigner()

    const settlementContract = new ethers.Contract(
        settlementContractAddress(),
        settlementAbi,
        signer
    )
    return await settlementContract.quoteInitialize(order, destEid)
  }

  async function initOrder(order, signature, quote) {
    const provider = new ethers.providers.Web3Provider(walletProvider)
    const signer = provider.getSigner()

    const settlementContract = new ethers.Contract(
        settlementContractAddress(),
        settlementAbi,
        signer
    )

    const inputAmount = ethers.utils.parseEther(amount.toString())
    console.log(order, signature, quote, inputAmount, targetChain)
    return await settlementContract.initiate(
        order,
        signature,
        ethers.utils.defaultAbiCoder.encode(
            ["uint256", "uint256"], [targetChain, quote.nativeFee]
        ),
        {
          value: inputAmount.add(quote.nativeFee),
        }
    )
  }

  // Form submit
  async function handleSubmit() {
    const order = await createOrder()
    console.log("created order", order)
    const signature = await signOrder(order)
    console.log("created signature", signature)
    const initQuote = await quoteInit(order)
    console.log("quote init", initQuote)
    const initTx = await initOrder(order, signature, initQuote)
    console.log("init tx", initTx)
    alert("Transaction sent", initTx.hash)
  }

  useEffect(() => {
    setOriginChain(selectedNetworkId);
  }, [selectedNetworkId]);
  return (
    <div className="rounded-none md:rounded-2xl p-4 md:p-8 shadow-input bg-white ">
      <h2 className="font-bold text-xl text-neutral-800">Get Started</h2>
      <p className="text-neutral-600 text-sm max-w-sm mt-2 mb-6">
        Start swapping cross-chain in a few simple steps.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Otomatik olarak aktif chain'den gelecek. */}
        <LabelInputContainer className="mb-4">
          <Label htmlFor="originChain">📍 Origin Chain</Label>
          <div className="rounded-lg border px-4 py-2 bg-textColor">
            <w3m-network-button />
          </div>
        </LabelInputContainer>
        <LabelInputContainer>
          <Label htmlFor="targetChain">🎯 Target Chain</Label>
          <Select onValueChange={setTargetChain}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Target Chain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={"11155111"}>Sepolia</SelectItem>
              <SelectItem value={"84532"}>Base Sepolia</SelectItem>
              <SelectItem value={"534351"}>Scroll Sepolia</SelectItem>
            </SelectContent>
          </Select>
        </LabelInputContainer>
        <LabelInputContainer className="mb-4">
          <Label htmlFor="originChain">⏰ Deadline</Label>
          <Select onValueChange={setDeadline}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Deadline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={"300"}>5 Min.</SelectItem>
              <SelectItem value={"600"}>10 Min.</SelectItem>
              <SelectItem value={"900"}>15 Min.</SelectItem>
            </SelectContent>
          </Select>
        </LabelInputContainer>

        <LabelInputContainer className="mb-4">
          <Label htmlFor="originChain">🟡 ETH Amount</Label>
          <input
            type="number"
            defaultValue={"1"}
            onChange={(e) => setAmount(e.target.value.toString())}
            className="rounded-lg active:border-brand-500 border-2 w-full h-10 text-xl px-4 border-brand-400 focus:border-brand-primary focus:ring-brand-primary"
          />
        </LabelInputContainer>
        <button
          className={`${
            !isConnected ? `cursor-not-allowed` : null
          } bg-gradient-to-br relative group/btn hover:border-primary focus:bg-accent focus:text-textColor duration-500 transition-colors animate-in bg-gray-50 block w-full text-textColor shadow-input rounded-md h-10 font-medium border-accent border`}
          type="submit"
          disabled={!isConnected}
          onClick={handleSubmit}
        >
          Send
          <BottomGradient />
        </button>
      </form>
    </div>
  );
};

export default SwapForm;
