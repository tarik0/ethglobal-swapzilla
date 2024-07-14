import React, { useEffect } from "react";
import { useWeb3Modal, useWeb3ModalAccount } from "@web3modal/ethers5/react";

const Hero = () => {
  const { open: connectAWallet, close } = useWeb3Modal({ view: "Connect" });
  const { open: manageAccount } = useWeb3Modal({ view: "Networks" });
  const {
    address: userWalletAddress,
    isConnecting,
    isDisconnected,
    isConnected,
  } = useWeb3ModalAccount();

  useEffect(() => {
    console.log("isConnecting: ", isConnecting);
    console.log("isDisconnected: ", isDisconnected);
    console.log("address: ", userWalletAddress);
    console.log("isConnected: ", isConnected);
  }, [isConnecting, userWalletAddress, isDisconnected, isConnected]);
  return (
    <section className=" h-[100vh] w-[100] bg-mainWhite bg-dot-black/[0.2] relative flex flex-col items-center justify-center mx-auto">
      {/* Radial gradient for the container to give a faded look */}
      <div className="absolute pointer-events-none inset-0 flex items-center justify-center bg-mainWhite [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black)]"></div>
      <section id="hero" className="mx-auto max-w-screen-xl text-center  ">
        <div className="mb-2 flex justify-center items-center gap-1">
          <img
            src="/src/assets/Swapzilla.svg"
            className="mr-3 h-6 sm:h-9"
            alt="Flowbite Logo"
          />
          <span className="self-center text-xl font-semibold whitespace-nowrap ">
            Swapzilla
          </span>
        </div>
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight leading-none text-textColor md:text-5xl lg:text-6xl ">
          Cross-chain, marketplace-based way of swapping.
        </h1>
        <p className="mb-8 text-lg font-normal text-gray-500 lg:text-xl sm:px-16 xl:px-48 ">
          We introduce a new way of swapping tokens across different blockchains
          in a marketplace-based system.
        </p>
        <button
          className="p-[3px] relative"
          onClick={isConnected ? null : connectAWallet}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-lg " />
          <div className="px-8 py-2  bg-black rounded-[6px]  relative group transition duration-200  text-white hover:bg-transparent">
            {!isConnected ? "Connect Your Wallet" : <w3m-account-button />}
          </div>
        </button>
      </section>
    </section>
  );
};

export default Hero;
