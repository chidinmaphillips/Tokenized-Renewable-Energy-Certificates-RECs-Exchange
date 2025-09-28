import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringAsciiCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_AMOUNT = 101;
const ERR_INSUFFICIENT_BALANCE = 102;
const ERR_INVALID_RECIPIENT = 103;
const ERR_PAUSED = 105;
const ERR_MAX_SUPPLY_EXCEEDED = 107;
const ERR_INVALID_HASH = 115;
const ERR_INVALID_LOCATION = 116;
const ERR_INVALID_SOURCE_TYPE = 117;
const ERR_INVALID_EXPIRY = 118;
const ERR_EXPIRED = 119;
const ERR_NOT_ADMIN = 120;
const ERR_NOT_MINTER = 121;
const ERR_ALREADY_MINTED = 112;
const ERR_INVALID_BATCH_ID = 113;

interface BatchMetadata {
  hash: Uint8Array;
  timestamp: number;
  location: string;
  sourceType: string;
  expiry: number;
}

interface Result<T> {
  ok: boolean;
  value: T | number;
}

class RecTokenMock {
  state: {
    tokenName: string;
    tokenSymbol: string;
    tokenDecimals: number;
    totalSupply: number;
    maxSupply: number;
    tokenUri: string | null;
    contractAdmin: string;
    minterRole: string;
    paused: boolean;
    balances: Map<string, number>;
    batchMetadata: Map<number, BatchMetadata>;
  } = {
    tokenName: "REC-Token",
    tokenSymbol: "REC",
    tokenDecimals: 0,
    totalSupply: 0,
    maxSupply: 1000000000000,
    tokenUri: null,
    contractAdmin: "ST1ADMIN",
    minterRole: "ST1ADMIN",
    paused: false,
    balances: new Map(),
    batchMetadata: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CALLER";
  events: Array<{ event: string; [key: string]: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      tokenName: "REC-Token",
      tokenSymbol: "REC",
      tokenDecimals: 0,
      totalSupply: 0,
      maxSupply: 1000000000000,
      tokenUri: null,
      contractAdmin: "ST1ADMIN",
      minterRole: "ST1ADMIN",
      paused: false,
      balances: new Map(),
      batchMetadata: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CALLER";
    this.events = [];
  }

  getName(): Result<string> {
    return { ok: true, value: this.state.tokenName };
  }

  getSymbol(): Result<string> {
    return { ok: true, value: this.state.tokenSymbol };
  }

  getDecimals(): Result<number> {
    return { ok: true, value: this.state.tokenDecimals };
  }

  getBalance(account: string): Result<number> {
    return { ok: true, value: this.state.balances.get(account) || 0 };
  }

  getTotalSupply(): Result<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getTokenUri(): Result<string | null> {
    return { ok: true, value: this.state.tokenUri };
  }

  getBatchMetadata(batchId: number): BatchMetadata | null {
    return this.state.batchMetadata.get(batchId) || null;
  }

  setMinterRole(newMinter: string): Result<boolean> {
    if (this.caller !== this.state.contractAdmin) return { ok: false, value: ERR_NOT_ADMIN };
    this.state.minterRole = newMinter;
    return { ok: true, value: true };
  }

  setPaused(newPaused: boolean): Result<boolean> {
    if (this.caller !== this.state.contractAdmin) return { ok: false, value: ERR_NOT_ADMIN };
    this.state.paused = newPaused;
    return { ok: true, value: true };
  }

  setTokenUri(newUri: string | null): Result<boolean> {
    if (this.caller !== this.state.contractAdmin) return { ok: false, value: ERR_NOT_ADMIN };
    this.state.tokenUri = newUri;
    return { ok: true, value: true };
  }

  mint(amount: number, recipient: string, batchId: number, hash: Uint8Array, location: string, sourceType: string, expiry: number): Result<boolean> {
    if (this.caller !== this.state.minterRole) return { ok: false, value: ERR_NOT_MINTER };
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    const newSupply = this.state.totalSupply + amount;
    if (newSupply > this.state.maxSupply) return { ok: false, value: ERR_MAX_SUPPLY_EXCEEDED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (recipient === this.caller) return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (location.length === 0 || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["solar", "wind", "hydro"].includes(sourceType)) return { ok: false, value: ERR_INVALID_SOURCE_TYPE };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    if (this.state.batchMetadata.has(batchId)) return { ok: false, value: ERR_ALREADY_MINTED };
    this.state.batchMetadata.set(batchId, { hash, timestamp: this.blockHeight, location, sourceType, expiry });
    const currentBalance = this.state.balances.get(recipient) || 0;
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalSupply = newSupply;
    this.events.push({ event: "mint", batchId, amount, recipient });
    return { ok: true, value: true };
  }

  burn(amount: number, batchId: number): Result<boolean> {
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const balance = this.state.balances.get(this.caller) || 0;
    if (balance < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    const meta = this.state.batchMetadata.get(batchId);
    if (!meta) return { ok: false, value: ERR_INVALID_BATCH_ID };
    if (this.blockHeight >= meta.expiry) return { ok: false, value: ERR_EXPIRED };
    this.state.balances.set(this.caller, balance - amount);
    this.state.totalSupply -= amount;
    this.events.push({ event: "burn", batchId, amount });
    return { ok: true, value: true };
  }

  transfer(amount: number, sender: string, recipient: string, memo?: Uint8Array): Result<boolean> {
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (sender !== this.caller) return { ok: false, value: ERR_INVALID_SENDER };
    if (recipient === sender) return { ok: false, value: ERR_INVALID_RECIPIENT };
    const senderBalance = this.state.balances.get(sender) || 0;
    if (senderBalance < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    if (memo && memo.length > 34) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.balances.set(sender, senderBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) || 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    this.events.push({ event: "transfer", amount, sender, recipient, memo });
    return { ok: true, value: true };
  }
}

describe("RecTokenContract", () => {
  let contract: RecTokenMock;

  beforeEach(() => {
    contract = new RecTokenMock();
    contract.reset();
  });

  it("mints tokens successfully", () => {
    contract.caller = "ST1ADMIN";
    const hash = new Uint8Array(32).fill(1);
    const result = contract.mint(100, "ST2RECIP", 1, hash, "LocationX", "solar", 1000);
    expect(result.ok).toBe(true);
    expect(contract.getBalance("ST2RECIP").value).toBe(100);
    expect(contract.getTotalSupply().value).toBe(100);
    const meta = contract.getBatchMetadata(1);
    expect(meta?.location).toBe("LocationX");
  });

  it("rejects mint by non-minter", () => {
    contract.caller = "ST3FAKE";
    const hash = new Uint8Array(32).fill(1);
    const result = contract.mint(100, "ST2RECIP", 1, hash, "LocationX", "solar", 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_MINTER);
  });

  it("rejects transfer when paused", () => {
    contract.caller = "ST1ADMIN";
    contract.setPaused(true);
    const result = contract.transfer(50, "ST1ADMIN", "ST2RECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAUSED);
  });

  it("sets minter role successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMinterRole("ST3NEWMINTER");
    expect(result.ok).toBe(true);
    expect(contract.state.minterRole).toBe("ST3NEWMINTER");
  });

  it("rejects set minter by non-admin", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setMinterRole("ST4NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_ADMIN);
  });

  it("rejects mint exceeding max supply", () => {
    contract.caller = "ST1ADMIN";
    const hash = new Uint8Array(32).fill(1);
    contract.state.maxSupply = 100;
    contract.mint(100, "ST2RECIP", 1, hash, "LocationX", "solar", 1000);
    const result = contract.mint(1, "ST2RECIP", 2, hash, "LocationY", "wind", 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_SUPPLY_EXCEEDED);
  });

  it("rejects invalid source type on mint", () => {
    contract.caller = "ST1ADMIN";
    const hash = new Uint8Array(32).fill(1);
    const result = contract.mint(100, "ST2RECIP", 1, hash, "LocationX", "invalid", 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SOURCE_TYPE);
  });

  it("gets token details correctly", () => {
    expect(contract.getName().value).toBe("REC-Token");
    expect(contract.getSymbol().value).toBe("REC");
    expect(contract.getDecimals().value).toBe(0);
    expect(contract.getTotalSupply().value).toBe(0);
  });

  it("sets token uri successfully", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setTokenUri("https://example.com");
    expect(result.ok).toBe(true);
    expect(contract.getTokenUri().value).toBe("https://example.com");
  });
});