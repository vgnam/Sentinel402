import { InputError, money, MAX_UNITS } from './domain.mjs';

/** Offline normalizer for an explicitly selected x402 v2 exact quote.
 * No automatic offer selection, signing, network call, or settlement.
 * A deployment must configure the asset/chain/decimal binding outside the agent.
 */
export function normalizeX402(required, {intentId,reference,index,network,asset,decimals=6}) {
  if(typeof network!=='string'||!network.length||typeof asset!=='string'||!asset.length)throw new InputError('Trusted network and asset configuration required');
  if(required?.x402Version!==2||!Array.isArray(required.accepts)||!Number.isInteger(index)||index<0||!required.accepts[index])throw new InputError('Explicit x402 v2 offer selection required');
  const offer=required.accepts[index];
  if(offer.scheme!=='exact'||offer.network!==network||offer.asset!==asset||decimals!==6)throw new InputError('Unsupported or mismatched scheme, network, asset, or precision');
  if(offer.extra?.paymentFlow && offer.extra.paymentFlow!=='immediate')throw new InputError('Unsupported payment flow');
  if(typeof offer.amount!=='string'||!/^[1-9]\d*$/.test(offer.amount)||offer.amount.length>13||BigInt(offer.amount)>BigInt(MAX_UNITS))throw new InputError('Invalid x402 atomic amount');
  if(typeof required.resource?.url!=='string'||!required.resource.url.startsWith('https://'))throw new InputError('HTTPS x402 resource required');
  return {intentId,reference,amount:money(Number(offer.amount)),recipient:offer.payTo,resource:required.resource.url};
}
