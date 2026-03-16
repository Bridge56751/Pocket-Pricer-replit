export function logTikTokScanEvent(
  _deviceId: string,
  _isPro: boolean,
  _productName: string
): void {}

export function logTikTokSubscriptionEvent(
  _userId: string,
  _eventType: "Subscribe" | "StartTrial",
  _value: number,
  _currency: string
): void {}

export function logTikTokEbaySearchEvent(
  _deviceId: string,
  _isPro: boolean,
  _searchQuery: string
): void {}
