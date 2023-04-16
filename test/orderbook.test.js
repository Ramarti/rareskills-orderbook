const { expect } = require("chai")
const hre = require("hardhat")
const { ethers } = hre

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

    const ERC20 = await ethers.getContractFactory("ERC20")
    token1 = await ERC20.deploy("Token1", "TK1")
    token2 = await ERC20.deploy("Token2", "TK2")

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
    const buyOrder = {
      from: buyer.address,
      token1: token1.address,
      amount1: '100',
      token2: token2.address,
      amount2: '50',
      expiraton: `${Math.floor(Date.now() / 1000) + 60}`,
    }
    console.dir(buyOrder)

    const sellOrder = {
      from: seller.address,
      token1: token1.address,
      amount1: '100',
      token2: token2.address,
      amount2: '50',
      expiraton: `${Math.floor(Date.now() / 1000) + 60}`,
    }
    console.dir(sellOrder)
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
    }
    
    const buySig = await buyer._signTypedData(domain, types, buyOrder) 
    const sellSig = await seller._signTypedData(domain, types, sellOrder)
    return
    await token1
      .connect(relayer)
      .approve(orderBookExecutor.address, buyOrder.amount1)
    await token2
      .connect(relayer)
      .approve(orderBookExecutor.address, sellOrder.amount1)
    // const buyerBalancesBefore = [await token1.balanceOf(buyer.address), await token2.balanceOf(buyer.address)]
    //const sellerBalancesBefore = [await token1.balanceOf(seller.address), await token2.balanceOf(seller.address)]

    await expect(
      orderBookExecutor
        .connect(relayer)
        .executeOrders(buyOrder, buySig, sellOrder, sellSig)
    ).to.emit(token1, "Transfer")

    const buyerBalancesAfter = [await token1.balanceOf(buyer.address), await token2.balanceOf(buyer.address)]
    const sellerBalancesAfter = [await token1.balanceOf(seller.address), await token2.balanceOf(seller.address)]

    expect(buyerBalancesAfter[0]).to.equal(buyerBalancesBefore[0].add(buyOrder.amount1))
    expect(buyerBalancesAfter[1]).to.equal(buyerBalancesBefore[1].sub(buyOrder.amount2))
    expect(sellerBalancesAfter[0]).to.equal(sellerBalancesBefore[0].sub(sellOrder.amount1))
    expect(sellerBalancesAfter[1]).to.equal(sellerBalancesBefore[1].add(sellOrder.amount2))
  })
})
