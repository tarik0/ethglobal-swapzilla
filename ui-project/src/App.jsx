import { createWeb3Modal, defaultConfig } from "@web3modal/ethers5/react";

// 1. Your WalletConnect Cloud project ID
const projectId = "61658dfc0addfa0de74535259e960678";

// 2. Set chains
const sepolia = {
  chainId: 11155111,
  name: "Sepolia",
  currency: "ETH",
  explorerUrl: "https://eth-sepolia.blockscout.com/",
  rpcUrl: "https://rpc.sepolia.org",
};

const base = {
  chainId: 84532,
  name: "Base Sepolia",
  currency: "ETH",
  explorerUrl: "https://base-sepolia.blockscout.com/",
  rpcUrl: "https://base-sepolia-rpc.publicnode.com",
};

const scroll = {
  chainId: 534351,
  name: "Scroll Sepolia",
  currency: "ETH",
  explorerUrl: "https://sepolia.scrollscan.com/",
  rpcUrl: "https://scroll-sepolia.drpc.org",
};

const metadata = {
  name: "ETHGlobal Brussels 2024 Hackaton",
  description: "AppKit Example",
  url: "https://web3modal.com", // origin must match your domain & subdomain
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
};

const ethersConfig = defaultConfig({
  metadata,
});

createWeb3Modal({
  ethersConfig,
  chains: [sepolia, base, scroll],
  projectId,
  enableAnalytics: true,
});

import "./App.css";
import FAQ from "./components/Faq";
import SwapForm from "./components/SwapForm";

function App() {
  return (
    <section className="max-w-screen-lg h-[100vh] mx-auto  rounded-lg px-4 flex justify-between items-center ">
      <SwapForm />
      <FAQ />
    </section>
  );
}

export default App;
