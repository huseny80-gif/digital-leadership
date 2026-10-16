import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has the element but does not implement native modal dialog methods.
// Browsers supply top-layer focus/inert behavior; tests exercise our choices
// and lifecycle against the corresponding open/closed element state.
if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true; };
if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; };

afterEach(() => {
  cleanup();
});
