const { expect } = require("chai")
const hre = require("hardhat")
const { ethers } = hre
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function sendPermit(chainId, token, signer, spender, amount, nonce, deadline) {

  const domain = {
    name: await token.name(),
    version: "1",
    chainId: chainId,
    verifyingContract: token.address,
  }
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  }
  const permit = {
    owner: signer.address,
    spender: spender,
    value: amount,
    nonce: nonce,
    deadline: deadline,
  }
  const sig = await signer._signTypedData(domain, types, permit);
  const { r, s, v } = ethers.utils.splitSignature(sig);

  return token.permit(signer.address, spender, amount, deadline, v, r, s);

}

describe("OrderBookExecutor", function () {
  let OrderBookExecutor,
    orderBookExecutor,
    relayer,
    token1,
    token2,
    buyer,
    seller

  beforeEach(async function () {
    ;[owner, relayer, buyer, seller, _] = await ethers.getSigners()

    const Token = await ethers.getContractFactory("Token")
    token1 = await Token.deploy("Token1", "TK1")
    await token1.mint(buyer.address, 1000)
    await token1.mint(seller.address, 1000)

    token2 = await Token.deploy("Token2", "TK2")
    await token2.mint(buyer.address, 1000)
    await token2.mint(seller.address, 1000)

    OrderBookExecutor = await ethers.getContractFactory("OrderBookExecutor")
    orderBookExecutor = await OrderBookExecutor.deploy(relayer.address, [
      token1.address,
      token2.address,
    ])
    await orderBookExecutor.deployed()
  })

  it("Should deploy the contract with the correct relayer", async function () {
    expect(
      await orderBookExecutor.hasRole(
        await orderBookExecutor.RELAYER_ROLE(),
        relayer.address
      )
    ).to.equal(true)
  })

  it("Should allow executing matching orders", async function () {
    const latest = await time.latest()
    // Wants to buy 100 token1 for 50 token2
    const buyOrder = {
      from: buyer.address,
      token1: token1.address,
      amount1: '100',
      token2: token2.address,
      amount2: '50',
      expiration: `${latest + 1000}`

    }
    // Wants to sell 100 token1 for 50 token2
    const sellOrder = {
      from: seller.address,
      token1: token1.address,
      amount1: '100',
      token2: token2.address,
      amount2: '50',
      expiration: `${latest + 1000}`
    }

    const domain = {
      name: "OrderBookExecutor",
      version: "1",
      chainId: hre.network.config.chainId,
      verifyingContract: orderBookExecutor.address,
    }

    const types = {
      Order: [
        { name: "from", type: "address" },
        { name: "token1", type: "address" },
        { name: "amount1", type: "uint256" },
        { name: "token2", type: "address" },
        { name: "amount2", type: "uint256" },
        { name: "expiration", type: "uint64" },
      ],
    };
    const buySig = await buyer._signTypedData(domain, types, buyOrder)
    const sellSig = await seller._signTypedData(domain, types, sellOrder)

    await sendPermit(domain.chainId, token2, buyer, orderBookExecutor.address, buyOrder.amount2, 0, buyOrder.expiration)
    await sendPermit(domain.chainId, token1, seller, orderBookExecutor.address, buyOrder.amount1, 0, sellOrder.expiration)

    const buyerBalancesBefore = [await token1.balanceOf(buyer.address), await token2.balanceOf(buyer.address)]
    const sellerBalancesBefore = [await token1.balanceOf(seller.address), await token2.balanceOf(seller.address)]
    await orderBookExecutor
      .connect(relayer)
      .executeOrders(buyOrder, buySig, sellOrder, sellSig)

    const buyerBalancesAfter = [await token1.balanceOf(buyer.address), await token2.balanceOf(buyer.address)]
    const sellerBalancesAfter = [await token1.balanceOf(seller.address), await token2.balanceOf(seller.address)]

    expect(buyerBalancesAfter[0]).to.equal(buyerBalancesBefore[0].add(buyOrder.amount1))
    expect(buyerBalancesAfter[1]).to.equal(buyerBalancesBefore[1].sub(buyOrder.amount2))
    expect(sellerBalancesAfter[0]).to.equal(sellerBalancesBefore[0].sub(sellOrder.amount1))
    expect(sellerBalancesAfter[1]).to.equal(sellerBalancesBefore[1].add(sellOrder.amount2))
  })
})
