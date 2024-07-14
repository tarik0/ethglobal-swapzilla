import React from "react";
import { GridBackground } from "./ui/background-grid";

const Header = () => {
  return (
    <header className="items-center mx-auto max-w-screen-xl my-4">
      <a href="/" className="flex items-center lg:justify-center lg:order-2">
        <img
          src="https://flowbite.com/docs/images/logo.svg"
          className="mr-3 h-6 sm:h-9"
          alt="Flowbite Logo"
        />
        <span className="self-center text-xl font-semibold whitespace-nowrap dark:text-white">
          Flowbite
        </span>
      </a>
    </header>
  );
};

export default Header;
