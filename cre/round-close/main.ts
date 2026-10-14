import {
  bytesToHex,
  consensusMedianAggregation,
  decodeJson,
  encodeCallMsg,
  EVMClient,
  getNetwork,
  handler,
  HTTPCapability,
  HTTPClient,
  LATEST_BLOCK_NUMBER,
  Runner,
  type HTTPPayload,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk"
import { decodeFunctionResult, encodeFunctionData, zeroAddress, type Address } from "viem"

type Config = {
  chainName: string
  ausdAddress: string
  priceUrl: string
  settleUrl: string
}

type RoundRequest = {
  betId?: string
  direction?: string
  strike?: number
  symbol?: string
}

const ausdAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const

let pendingBody = ""

const fetchBtcPrice = (nodeRuntime: NodeRuntime<Config>): number => {
  const http = new HTTPClient()
  const response = http
    .sendRequest(nodeRuntime, {
      url: nodeRuntime.config.priceUrl,
      method: "GET",
    })
    .result()
  if (response.statusCode !== 200) {
    throw new Error(`price feed returned ${response.statusCode}`)
  }
  const body = JSON.parse(new TextDecoder().decode(response.body)) as { price?: string }
  const price = Number(body.price)
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("price feed did not return a BTC price")
  }
  return price
}

const postClose = (nodeRuntime: NodeRuntime<Config>): number => {
  const http = new HTTPClient()
  const response = http
    .sendRequest(nodeRuntime, {
      url: nodeRuntime.config.settleUrl,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new TextEncoder().encode(pendingBody),
    })
    .result()
  return response.statusCode
}

const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  const request = decodeJson(payload.input) as RoundRequest
  const direction = request.direction === "DOWN" ? "DOWN" : "UP"
  const strike = Number(request.strike)
  if (!Number.isFinite(strike) || strike <= 0) {
    throw new Error("strike is required")
  }

  const price = runtime.runInNodeMode(fetchBtcPrice, consensusMedianAggregation<number>())().result()
  runtime.log(`BTC/USD ${price}`)

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainName,
  })
  if (!network) {
    throw new Error(`Unknown chain ${runtime.config.chainName}`)
  }

  const evm = new EVMClient(network.chainSelector.selector)
  const callData = encodeFunctionData({ abi: ausdAbi, functionName: "decimals" })
  const read = evm
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.ausdAddress as Address,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result()
  const decimals = Number(
    decodeFunctionResult({
      abi: ausdAbi,
      functionName: "decimals",
      data: bytesToHex(read.data),
    }),
  )
  runtime.log(`Monad AUSD decimals ${decimals}`)

  const won = direction === "UP" ? price > strike : price < strike
  const close = {
    betId: request.betId ?? null,
    symbol: request.symbol ?? "BTC",
    direction,
    strike,
    price,
    won,
    ausdDecimals: decimals,
    chain: runtime.config.chainName,
    settledBy: "chainlink-cre",
  }
  pendingBody = JSON.stringify(close)
  const status = runtime.runInNodeMode(postClose, consensusMedianAggregation<number>())().result()
  runtime.log(`Posted round close, status ${status}`)
  return pendingBody
}

const initWorkflow = (_config: Config) => {
  const http = new HTTPCapability()
  return [handler(http.trigger({}), onHttpTrigger)]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
